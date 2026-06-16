'use client';

type Lang = 'he' | 'en';

interface UpgradeModalProps {
  lang: Lang;
  onClose: () => void;
}

// Platform is fully free — this modal is intentionally disabled.
export function UpgradeModal(_props: UpgradeModalProps) {
  return null;
}
