from flask import Flask, jsonify, request
from openai import OpenAI
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


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


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5003))
    debug = os.getenv("FLASK_ENV") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)
