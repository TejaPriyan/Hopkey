import type { ReactNode, MouseEvent } from 'react';
import { href, navigate } from '../lib/router.ts';

export function Link({ to, className, children, ariaLabel }: { to: string; className?: string; children: ReactNode; ariaLabel?: string }) {
  return (
    <a href={href(to)} className={className} aria-label={ariaLabel}
      onClick={(e: MouseEvent) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); navigate(to); }}>
      {children}
    </a>
  );
}
