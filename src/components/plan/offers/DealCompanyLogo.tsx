'use client';

export interface DealCompany {
  id: string;
  name: string;
  categoryLabel?: string;
}

/** Resolves the real company / brand for any curated or live student deal. */
export function getOfferCompany(offer: { id?: string; title?: string; source?: string }): DealCompany {
  const id = (offer.id ?? '').toLowerCase();
  const title = (offer.title ?? '').toLowerCase();

  if (id.includes('neotaste') || title.includes('neotaste')) return { id: 'neotaste', name: 'NeoTaste' };
  if (id.includes('pret') || title.includes('pret')) return { id: 'pret', name: 'Pret A Manger' };
  if (id.includes('greggs') || title.includes('greggs')) return { id: 'greggs', name: 'Greggs' };
  if (id.includes('gail') || title.includes('gail') || title.includes('blank street')) return { id: 'gails', name: "GAIL's Bakery" };
  if (id.includes('itsu') || title.includes('itsu')) return { id: 'itsu', name: 'itsu' };
  if (id.includes('wasabi') || title.includes('wasabi')) return { id: 'wasabi', name: 'Wasabi' };
  if (id.includes('franco') || title.includes('franco')) return { id: 'franco-manca', name: 'Franco Manca' };
  if (id.includes('honest') || title.includes('honest')) return { id: 'honest-burgers', name: 'Honest Burgers' };
  if (id.includes('tortilla') || title.includes('tortilla')) return { id: 'tortilla', name: 'Tortilla' };
  if (id.includes('zizzi') || title.includes('zizzi')) return { id: 'zizzi', name: 'Zizzi' };
  if (id.includes('pizza-express') || title.includes('pizza express') || title.includes('pizzaexpress')) return { id: 'pizza-express', name: 'PizzaExpress' };
  if (id.includes('leon') || title.includes('leon')) return { id: 'leon', name: 'LEON' };
  if (id.includes('asos') || title.includes('asos')) return { id: 'asos', name: 'ASOS' };
  if (id.includes('nike') || title.includes('nike')) return { id: 'nike', name: 'Nike' };
  if (id.includes('jd') || title.includes('jd sports')) return { id: 'jd-sports', name: 'JD Sports' };
  if (id.includes('adidas') || title.includes('adidas')) return { id: 'adidas', name: 'Adidas' };
  if (id.includes('uniqlo') || title.includes('uniqlo')) return { id: 'uniqlo', name: 'Uniqlo' };
  if (id.includes('hm') || title.includes('urban outfitters') || title.includes('mango') || title.includes('h&m')) return { id: 'urban-outfitters', name: 'Urban Outfitters & H&M' };
  if (id.includes('rokit') || title.includes('rokit') || title.includes('beyond retro')) return { id: 'rokit', name: 'Rokit Vintage' };
  if (id.includes('tesco') || title.includes('tesco')) return { id: 'tesco', name: 'Tesco' };
  if (id.includes('sainsbury') || title.includes('sainsbury')) return { id: 'sainsburys', name: "Sainsbury's" };
  if (id.includes('lidl') || title.includes('lidl')) return { id: 'lidl', name: 'Lidl' };
  if (id.includes('waitrose') || title.includes('waitrose')) return { id: 'waitrose', name: 'Waitrose' };
  if (id.includes('olio') || title.includes('olio')) return { id: 'olio', name: 'OLIO' };
  if (id.includes('oyster') || id.includes('tfl') || title.includes('oyster') || title.includes('tfl')) return { id: 'tfl', name: 'Transport for London' };
  if (id.includes('railcard') || title.includes('railcard') || title.includes('national rail')) return { id: 'railcard', name: 'National Rail' };
  if (id.includes('tgtg') || title.includes('too good to go')) return { id: 'tgtg', name: 'Too Good To Go' };

  return { id: 'generic', name: 'Student Partner' };
}

interface DealCompanyLogoProps {
  companyId?: string;
  offer?: { id?: string; title?: string; source?: string };
  size?: number;
  className?: string;
}

/**
 * Authentic vector brand logos for companies in the student deals section.
 */
export function DealCompanyLogo({ companyId, offer, size = 44, className = '' }: DealCompanyLogoProps) {
  const resolved = companyId ?? (offer ? getOfferCompany(offer).id : 'generic');

  switch (resolved) {
    case 'tfl':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Transport for London logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#0A1128" />
          {/* TfL / London Underground Iconic Roundel */}
          <circle cx="22" cy="22" r="14" fill="none" stroke="#DC241F" strokeWidth="5.2" />
          <rect x="4" y="18" width="36" height="8" rx="2" fill="#0019A8" />
          <text x="22" y="24" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="6.8" letterSpacing="0.8">
            UNDERGROUND
          </text>
        </svg>
      );

    case 'railcard':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="National Rail logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#CC0000" />
          {/* National Rail Iconic Double Arrow */}
          <g fill="#FFFFFF">
            <path d="M10 18h16l-4-4h-8l4 4ZM14 26h16l-4-4H10l4 4Z" />
            <path d="M22 14l4 4h8l-6-6h-6ZM22 30l-4-4H10l6 6h6Z" />
            <rect x="10" y="21" width="24" height="2.2" rx="1.1" />
          </g>
          <text x="22" y="38" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="5" letterSpacing="0.4">
            RAILCARD
          </text>
        </svg>
      );

    case 'tesco':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Tesco logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#00539F" />
          <text x="22" y="22" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="10.5" letterSpacing="0.2">
            TESCO
          </text>
          {/* Iconic Tesco dashes */}
          <g fill="#EE1C2E">
            <rect x="9" y="26.5" width="4.2" height="1.8" rx="0.9" />
            <rect x="14.5" y="26.5" width="4.2" height="1.8" rx="0.9" />
            <rect x="20" y="26.5" width="4" height="1.8" rx="0.9" />
            <rect x="25.3" y="26.5" width="4.2" height="1.8" rx="0.9" />
            <rect x="30.8" y="26.5" width="4.2" height="1.8" rx="0.9" />
          </g>
          <text x="22" y="36" textAnchor="middle" fill="#FFD200" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="5.2" letterSpacing="0.2">
            CLUBCARD
          </text>
        </svg>
      );

    case 'sainsburys':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Sainsbury's logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#E85D10" />
          <text x="22" y="22" textAnchor="middle" fill="#FFFFFF" fontFamily="Georgia, serif" fontWeight="800" fontSize="18" fontStyle="italic">
            S
          </text>
          <text x="22" y="32" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="700" fontSize="5.5" letterSpacing="-0.2">
            Sainsbury&apos;s
          </text>
          <text x="22" y="38" textAnchor="middle" fill="#6A1A78" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="4.5" letterSpacing="0.3">
            NECTAR
          </text>
        </svg>
      );

    case 'lidl':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Lidl logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#0050AA" />
          {/* Lidl circular emblem */}
          <circle cx="22" cy="22" r="14" fill="#FFF000" stroke="#DE1A21" strokeWidth="2.5" />
          <text x="22" y="26" textAnchor="middle" fill="#0050AA" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="10" letterSpacing="-0.4">
            L<tspan fill="#DE1A21">I</tspan>DL
          </text>
        </svg>
      );

    case 'waitrose':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Waitrose logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#1C3B2B" />
          <text x="22" y="21" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="7.5" letterSpacing="1.2">
            WAITROSE
          </text>
          <line x1="12" y1="24" x2="32" y2="24" stroke="#A7C957" strokeWidth="1" />
          <text x="22" y="31" textAnchor="middle" fill="#A7C957" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="600" fontSize="4.8" letterSpacing="1.5">
            &amp; PARTNERS
          </text>
        </svg>
      );

    case 'greggs':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Greggs logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#0055A5" />
          {/* Greggs 4 golden yellow squares */}
          <g fill="#FFB81C">
            <rect x="16.5" y="10" width="4.5" height="4.5" rx="1" />
            <rect x="23" y="10" width="4.5" height="4.5" rx="1" />
            <rect x="16.5" y="16.5" width="4.5" height="4.5" rx="1" />
            <rect x="23" y="16.5" width="4.5" height="4.5" rx="1" />
          </g>
          <text x="22" y="31" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="8.5" letterSpacing="0.4">
            GREGGS
          </text>
        </svg>
      );

    case 'pret':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Pret A Manger logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#72122A" />
          {/* Pret Star */}
          <polygon points="22,8 24.5,15.5 32.5,15.5 26,20.5 28.5,28 22,23.5 15.5,28 18,20.5 11.5,15.5 19.5,15.5" fill="#FFFFFF" />
          <text x="22" y="35" textAnchor="middle" fill="#FFFFFF" fontFamily="Georgia, serif" fontWeight="800" fontSize="7.8" letterSpacing="1">
            PRET
          </text>
        </svg>
      );

    case 'gails':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="GAIL's Bakery logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#1C1C1C" />
          <text x="22" y="21" textAnchor="middle" fill="#F4EBD9" fontFamily="Georgia, serif" fontWeight="900" fontSize="9.5" letterSpacing="0.2">
            GAIL&apos;s
          </text>
          <text x="22" y="31" textAnchor="middle" fill="#D4A373" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="700" fontSize="5.2" letterSpacing="1.2">
            BAKERY
          </text>
        </svg>
      );

    case 'itsu':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="itsu logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#E4007D" />
          {/* itsu Butterfly */}
          <g fill="#FFFFFF">
            <path d="M19 12c-3-3-8-1-8 4 0 4 5 7 8 8 0-4 0-8 0-12Z" />
            <path d="M25 12c3-3 8-1 8 4 0 4-5 7-8 8 0-4 0-8 0-12Z" />
            <path d="M19 25c-2.5 1.5-6 1-6-2 0-2.5 3.5-3.5 6-3v5Z" />
            <path d="M25 25c2.5 1.5 6 1 6-2 0-2.5-3.5-3.5-6-3v5Z" />
          </g>
          <text x="22" y="36" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="7.5" letterSpacing="0.2">
            itsu
          </text>
        </svg>
      );

    case 'wasabi':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Wasabi logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#62A214" />
          <circle cx="22" cy="14" r="3.5" fill="#FFFFFF" />
          <text x="22" y="27" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="8" letterSpacing="-0.2">
            wasabi
          </text>
          <text x="22" y="34" textAnchor="middle" fill="#D7F2A2" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="700" fontSize="4.2" letterSpacing="0.8">
            SUSHI &amp; BENTO
          </text>
        </svg>
      );

    case 'franco-manca':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Franco Manca logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#B83A24" />
          {/* Woodfired Oven Flame */}
          <path d="M22 9c2.5 3.5 5 6.5 2 11 3-1.5 4-4.5 3-7 3.5 4.5 4.5 11-1 14.5-5 3-11 0-10.5-6.5.5-4 3.5-7.5 6.5-12Z" fill="#F4A261" />
          <text x="22" y="33" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="5.2" letterSpacing="0.8">
            FRANCO MANCA
          </text>
        </svg>
      );

    case 'honest-burgers':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Honest Burgers logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#142820" />
          <circle cx="22" cy="22" r="16" fill="none" stroke="#2D5A47" strokeWidth="1.5" />
          <text x="22" y="21" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="6.8" letterSpacing="0.6">
            HONEST
          </text>
          <text x="22" y="29" textAnchor="middle" fill="#A7C957" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="4.8" letterSpacing="0.8">
            BURGERS
          </text>
        </svg>
      );

    case 'tortilla':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Tortilla logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#D9381E" />
          <circle cx="22" cy="16" r="6" fill="#F4A261" />
          <text x="22" y="29" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="6.4" letterSpacing="0.8">
            TORTILLA
          </text>
          <text x="22" y="36" textAnchor="middle" fill="#FCEADE" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="700" fontSize="4" letterSpacing="0.4">
            CALIFORNIA BURRITOS
          </text>
        </svg>
      );

    case 'zizzi':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Zizzi logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#232120" />
          <polygon points="22,10 24,14 28,14 25,17 26,21 22,18 18,21 19,17 16,14 20,14" fill="#FFC107" />
          <text x="22" y="31" textAnchor="middle" fill="#FFFFFF" fontFamily="Georgia, serif" fontWeight="900" fontSize="10.5" fontStyle="italic">
            Zizzi
          </text>
        </svg>
      );

    case 'pizza-express':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="PizzaExpress logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#081C3B" />
          <circle cx="22" cy="18" r="9" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeDasharray="3 2" />
          <text x="22" y="32" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="5.4" letterSpacing="0.2">
            PIZZAEXPRESS
          </text>
        </svg>
      );

    case 'leon':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="LEON logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#FF6E00" />
          <text x="22" y="24" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="11" letterSpacing="0.4">
            LEON
          </text>
          <text x="22" y="32" textAnchor="middle" fill="#FFF275" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="4.4" letterSpacing="0.4">
            NATURALLY FAST
          </text>
        </svg>
      );

    case 'neotaste':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="NeoTaste logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#6320EE" />
          <path d="M15 12h4l6 12V12h4v20h-4l-6-12v12h-4V12Z" fill="#FFFFFF" />
          <circle cx="32" cy="12" r="2.5" fill="#00F5D4" />
          <text x="22" y="38" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="4.6" letterSpacing="0.4">
            NEOTASTE
          </text>
        </svg>
      );

    case 'tgtg':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Too Good To Go logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#00665E" />
          {/* Whirling Earth / TGTG icon */}
          <circle cx="22" cy="18" r="9" fill="none" stroke="#FFFFFF" strokeWidth="2.5" />
          <path d="M22 12c3.5 0 6 2.5 6 6s-2.5 6-6 6" fill="none" stroke="#E0A96D" strokeWidth="2" />
          <text x="22" y="34" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="5.2" letterSpacing="0.6">
            TOO GOOD TO GO
          </text>
        </svg>
      );

    case 'nike':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Nike logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#0A0A0A" />
          {/* Authentic Nike Swoosh */}
          <path
            d="M10 23.5c4.5 2.5 10 3.2 13.8 1.2 5.2-2.7 10.2-9.2 10.2-9.2s-2.8 5.8-8.2 10.2c-5.5 4.5-12.8 4.2-15.8-2.2Z"
            fill="#FFFFFF"
          />
          <text x="22" y="36" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="5" letterSpacing="0.6">
            NIKE
          </text>
        </svg>
      );

    case 'adidas':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Adidas logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#000000" />
          {/* 3 Adidas Bars */}
          <g fill="#FFFFFF">
            <polygon points="12,25 15,25 18,19 15,19" />
            <polygon points="17,25 20,25 24,15 21,15" />
            <polygon points="22,25 25,25 30,11 27,11" />
          </g>
          <text x="22" y="34" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="6.8" letterSpacing="0.2">
            adidas
          </text>
        </svg>
      );

    case 'asos':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="ASOS logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#000000" />
          <text x="22" y="27" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="11" letterSpacing="-0.2">
            asos
          </text>
        </svg>
      );

    case 'jd-sports':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="JD Sports logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#000000" />
          <circle cx="22" cy="22" r="16" fill="none" stroke="#FFDE00" strokeWidth="2.5" />
          <text x="22" y="27" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="13" letterSpacing="0.5">
            JD
          </text>
        </svg>
      );

    case 'uniqlo':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Uniqlo logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#E60012" />
          <text x="22" y="21" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="8" letterSpacing="0.2">
            UNI
          </text>
          <text x="22" y="31" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="8" letterSpacing="0.2">
            QLO
          </text>
        </svg>
      );

    case 'urban-outfitters':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Urban Outfitters and H&M logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#1A1A1A" />
          <text x="22" y="22" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="9.5" letterSpacing="0.5">
            UO
          </text>
          <text x="22" y="32" textAnchor="middle" fill="#C8102E" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="6.5" letterSpacing="0.2">
            H&amp;M
          </text>
        </svg>
      );

    case 'rokit':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Rokit Vintage logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#8B261D" />
          <text x="22" y="21" textAnchor="middle" fill="#FFFFFF" fontFamily="Georgia, serif" fontWeight="900" fontSize="8" letterSpacing="0.5">
            ROKIT
          </text>
          <text x="22" y="31" textAnchor="middle" fill="#F4A261" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="700" fontSize="4.6" letterSpacing="0.6">
            VINTAGE
          </text>
        </svg>
      );

    case 'olio':
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="OLIO logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#00B67A" />
          <circle cx="22" cy="18" r="7.5" fill="#FFFFFF" />
          <circle cx="19.5" cy="17" r="1.2" fill="#00B67A" />
          <circle cx="24.5" cy="17" r="1.2" fill="#00B67A" />
          <path d="M19.5 20c1 1.2 3.5 1.2 4.5 0" stroke="#00B67A" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          <text x="22" y="33" textAnchor="middle" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="7.2" letterSpacing="0.2">
            olio
          </text>
        </svg>
      );

    default:
      return (
        <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="Student deal partner logo" className={`shrink-0 rounded-2xl shadow-sm ${className}`}>
          <rect width="44" height="44" rx="12" fill="#1E293B" />
          <path d="M12 28l10-14 10 14H12Z" fill="none" stroke="#38BDF8" strokeWidth="2.5" />
          <circle cx="22" cy="22" r="3" fill="#38BDF8" />
          <text x="22" y="37" textAnchor="middle" fill="#94A3B8" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="4.8" letterSpacing="0.4">
            PARTNER
          </text>
        </svg>
      );
  }
}
