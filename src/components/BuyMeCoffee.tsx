export function BuyMeCoffee() {
  return (
    <div className="mt-8 mb-4 flex flex-col items-center justify-center">
      <div className="flex justify-center items-center min-h-[44px]">
        <a
          href="https://www.buymeacoffee.com/TejaPriyan"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border-2 border-black bg-[#FFDD00] px-4 py-2 font-['Comic_Sans_MS',Comic,cursive] text-sm font-bold text-black shadow-[3px_3px_0_#000000] transition-transform hover:-translate-y-0.5 active:translate-y-0 no-underline"
          title="Buy me a pizza"
        >
          <span className="text-xl leading-none" aria-hidden="true">🍕</span>
          <span>Buy me a pizza</span>
        </a>
      </div>
    </div>
  );
}
