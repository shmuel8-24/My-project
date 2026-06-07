'use client';

import { Suspense } from 'react';
import { ProfilePageInner } from '../../profile/page';

// Thin route alias: renders the existing Profile page component (which owns
// all the documents fetch/list/delete logic) and lands directly on its
// "Documents" tab — see ProfilePageInner's activeTab initializer, which opens
// the Documents tab whenever pathname === '/workspace/documents'.
export default function WorkspaceDocumentsPage() {
  return (
    <Suspense fallback={null}>
      <ProfilePageInner />
    </Suspense>
  );
}
