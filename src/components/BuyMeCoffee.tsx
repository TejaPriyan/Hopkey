import { useEffect, useRef, useState } from 'react';

export function BuyMeCoffee() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasWidget, setHasWidget] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (el.querySelector('script[data-name="bmc-button"]')) return;

    const observer = new MutationObserver(() => {
      if (el.querySelector('.bmc-btn-container') || el.querySelector('.bmc-btn')) {
        setHasWidget(true);
      }
    });
    observer.observe(el, { childList: true, subtree: true });

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js';
    script.setAttribute('data-name', 'bmc-button');
    script.setAttribute('data-slug', 'TejaPriyan');
    script.setAttribute('data-color', '#FFDD00');
    script.setAttribute('data-emoji', '🍕');
    script.setAttribute('data-font', 'Comic');
    script.setAttribute('data-text', 'Buy me a pizza');
    script.setAttribute('data-outline-color', '#000000');
    script.setAttribute('data-font-color', '#000000');
    script.setAttribute('data-coffee-color', '#ffffff');
    script.async = true;

    el.appendChild(script);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className="mt-8 mb-4 flex flex-col items-center justify-center">
      <div ref={containerRef} className="flex justify-center items-center min-h-[44px]">
        {!hasWidget && (
          <a
            href="https://www.buymeacoffee.com/TejaPriyan"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-black bg-[#FFDD00] px-4 py-2 font-['Comic_Sans_MS',Comic,cursive] text-sm font-bold text-black shadow-[3px_3px_0_#000000] transition-transform hover:-translate-y-0.5 active:translate-y-0 no-underline"
            title="Buy me a pizza"
          >
            <span className="text-xl leading-none">🍕</span>
            <span>Buy me a pizza</span>
          </a>
        )}
      </div>
    </div>
  );
}
