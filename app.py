from flask import Flask, jsonify, request
from openai import OpenAI
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
import chromadb
import pdfplumber
import io
import os

load_dotenv()

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50 MB upload limit

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

chroma_client = chromadb.PersistentClient(path="./chroma_storage")
collection = chroma_client.get_or_create_collection("pdf_documents")

embeddings_model = OpenAIEmbeddings(
    model="text-embedding-3-small",
    api_key=os.getenv("OPENAI_API_KEY"),
)
text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


@app.route("/test-ai", methods=["POST"])
def test_ai():
    data = request.get_json()
    message = data.get("message")
    if not message:
        return jsonify({"error": "message is required"}), 400

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": message}],
    )
    return jsonify({"reply": response.choices[0].message.content}), 200


@app.route("/upload-pdf", methods=["POST"])
def upload_pdf():
    if "file" not in request.files:
        return jsonify({"error": "no file field in request"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "no file selected"}), 400

    filename = secure_filename(file.filename)
    if not filename.lower().endswith(".pdf"):
        return jsonify({"error": "only PDF files are accepted"}), 400

    # Extract text from PDF entirely in memory
    pdf_bytes = io.BytesIO(file.read())
    text_parts = []
    with pdfplumber.open(pdf_bytes) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)

    full_text = "\n".join(text_parts)
    if not full_text.strip():
        return jsonify({"error": "no text could be extracted from this PDF"}), 422

    # Split → embed → store
    chunks = text_splitter.split_text(full_text)
    vectors = embeddings_model.embed_documents(chunks)

    # IDs are deterministic per filename so re-uploading the same file overwrites
    ids = [f"{filename}_chunk_{i}" for i in range(len(chunks))]
    collection.upsert(
        ids=ids,
        embeddings=vectors,
        documents=chunks,
        metadatas=[{"source": filename, "chunk_index": i} for i in range(len(chunks))],
    )

    return jsonify({
        "chunks_stored": len(chunks),
        "source": filename,
        "total_chars": len(full_text),
    }), 200


@app.route("/ask", methods=["POST"])
def ask():
    data = request.get_json()
    question = data.get("message") if data else None
    if not question:
        return jsonify({"error": "message is required"}), 400

    doc_count = collection.count()
    if doc_count == 0:
        return jsonify({"error": "no documents in the knowledge base — upload a PDF first"}), 400

    question_vector = embeddings_model.embed_query(question)
    results = collection.query(
        query_embeddings=[question_vector],
        n_results=min(5, doc_count),
        include=["documents", "metadatas"],
    )

    chunks = results["documents"][0]
    metadatas = results["metadatas"][0]
    context = "\n---\n".join(chunks)
    sources = list({m["source"] for m in metadatas})

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a helpful assistant. Answer questions strictly based on the "
                    "context provided in the user message. If the answer is not contained "
                    "in the context, say \"I don't have enough information in the provided "
                    "documents to answer that question.\" Do not use any outside knowledge."
                ),
            },
            {
                "role": "user",
                "content": f"Context:\n---\n{context}\n---\n\nQuestion: {question}",
            },
        ],
    )

    return jsonify({
        "answer": response.choices[0].message.content,
        "sources": sources,
        "chunks_used": len(chunks),
    }), 200


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5003))
    debug = os.getenv("FLASK_ENV") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)
