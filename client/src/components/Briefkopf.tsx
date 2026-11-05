// Letterhead and page footer of printed documents, following the templates of the canton
// (Amt / Zivilschutz top left, canton logo top right; address on the first page, then title and page numbers).
import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

/** Chromium (Chrome, Edge) prints page margin boxes (footer, page numbers); other browsers print without. */
export const marginBoxes = (() => {
  const m = navigator.userAgent.match(/Chrom(?:e|ium)\/(\d+)/);
  return !!m && Number(m[1]) >= 131;
})();

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');

export function useBataillon() {
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  return org.data?.bataillon;
}

/** Address line of the first page: «Musterstrasse 1, 1234 Musterhausen · T +41 00 000 00 00 · zivilschutz.example.ch». */
export function useAdresse() {
  const b = useBataillon()?.briefkopf;
  return b ? [b.adresse, b.telefon, b.web].filter(Boolean).join('   ') : '';
}

/**
 * Page setup while a document is shown: A4, footer left (title of the document), page numbers right;
 * on the first page the address instead of the title. `querformat` pages (named page) are landscape.
 */
export function usePrintPage(
  footer: string,
  { landscape = false, stand = '', margin = '12mm 14mm 16mm 16mm' }: { landscape?: boolean; stand?: string; margin?: string } = {},
) {
  const adresse = useAdresse();
  useEffect(() => {
    const el = document.createElement('style');
    const box = (pos: string, content: string) => `@${pos} { content: ${content}; font: 7.5pt Arial, Helvetica, sans-serif; color: #333; }`;
    const pages = `"${esc(stand ? `${stand} · ` : '')}Seite " counter(page) " / " counter(pages)`;
    const boxes = marginBoxes ? box('bottom-left', `"${esc(footer)}"`) + box('bottom-right', pages) : '';
    const first = marginBoxes && adresse ? `@page :first { ${box('bottom-left', `"${esc(adresse)}"`)} }` : '';
    el.textContent = `@media print {
      @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: ${margin}; ${boxes} }
      @page querformat { size: A4 landscape; margin: 12mm 10mm 16mm 10mm; ${boxes} }
      ${first}
    }`;
    document.head.appendChild(el);
    return () => el.remove();
  }, [footer, landscape, stand, adresse, margin]);
}

/** Letterhead: Amt (bold), Abteilung, Region left; canton logo right. `title` as in the templates (Arial Black). */
export function Briefkopf({
  title,
  subtitle,
  right,
  printOnly,
  compact,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  printOnly?: boolean;
  /** Title in the same row as the letterhead (landscape plans). */
  compact?: boolean;
  className?: string;
}) {
  const bat = useBataillon();
  const b = bat?.briefkopf;
  const lines = [b?.amt, b?.abteilung].filter(Boolean);
  const logo = bat?.kantonLogo ?? bat?.logo;
  return (
    <header className={`${printOnly ? 'print-only' : ''} mb-3 text-black ${className}`} style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div className="flex items-start justify-between gap-4">
        <div className="text-[10pt] leading-tight">
          {lines.length > 0 ? (
            <>
              <div className="font-bold">{lines[0]}</div>
              {lines[1] && <div>{lines[1]}</div>}
            </>
          ) : (
            <div className="font-bold">{bat?.regionName}</div>
          )}
          {lines.length > 0 && bat?.regionName && <div className="mt-0.5 text-[9pt]">{bat.regionName}</div>}
        </div>
        {compact && title && (
          <div className="min-w-0 flex-1 text-center">
            <h1 className="text-[14pt] leading-tight" style={{ fontFamily: '"Arial Black", Arial, Helvetica, sans-serif', fontWeight: 900 }}>
              {title}
            </h1>
            {subtitle && <div className="text-[9pt]">{subtitle}</div>}
          </div>
        )}
        <div className="flex items-start gap-4">
          {right}
          {logo && <img src={logo} alt="" style={{ height: '13mm', width: 'auto', maxWidth: '60mm' }} />}
        </div>
      </div>
      {title && !compact && (
        <div className="mt-4">
          <h1 className="text-[15pt] leading-tight" style={{ fontFamily: '"Arial Black", Arial, Helvetica, sans-serif', fontWeight: 900 }}>
            {title}
          </h1>
          {subtitle && <div className="mt-0.5 text-[10pt]">{subtitle}</div>}
        </div>
      )}
    </header>
  );
}
