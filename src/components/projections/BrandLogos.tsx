'use client';
import type { BrandLogoId } from '@/lib/finance/products';

interface BrandLogoProps {
  id: BrandLogoId;
  size?: number;
  className?: string;
}

/**
 * Authentic vector brand marks for the real UK bank savings providers and
 * real stock/ETF investments Argon selects from.
 */
export function BrandLogo({ id, size = 36, className = '' }: BrandLogoProps) {
  switch (id) {
    case 'trading212':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 40 40"
          role="img"
          aria-label="Trading 212 logo"
          className={`shrink-0 rounded-xl shadow-sm ${className}`}
        >
          <rect width="40" height="40" rx="10" fill="#0B132B" />
          <rect x="1" y="1" width="38" height="38" rx="9" fill="none" stroke="#00D2FF" strokeOpacity="0.35" />
          <path
            d="M7 14.5h8.2v2.4H12.4V26H9.7v-9.1H7v-2.4Z"
            fill="#00D2FF"
          />
          <text
            x="24.5"
            y="25.5"
            textAnchor="middle"
            fill="#FFFFFF"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="900"
            fontSize="11.5"
            letterSpacing="-0.5"
          >
            212
          </text>
        </svg>
      );

    case 'chase':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 40 40"
          role="img"
          aria-label="Chase UK logo"
          className={`shrink-0 rounded-xl shadow-sm ${className}`}
        >
          <rect width="40" height="40" rx="10" fill="#117ACA" />
          {/* Official Chase Octagon */}
          <g fill="#FFFFFF">
            <polygon points="15.2,8 25.8,8 31,13.2 15.2,13.2" />
            <polygon points="32,15.2 32,25.8 26.8,31 26.8,15.2" />
            <polygon points="24.8,32 14.2,32 9,26.8 24.8,26.8" />
            <polygon points="8,24.8 8,14.2 13.2,9 13.2,24.8" />
          </g>
        </svg>
      );

    case 'firstdirect':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 40 40"
          role="img"
          aria-label="first direct logo"
          className={`shrink-0 rounded-xl shadow-sm ${className}`}
        >
          <rect width="40" height="40" rx="10" fill="#0A0A0A" />
          <rect x="1" y="1" width="38" height="38" rx="9" fill="none" stroke="#FFFFFF" strokeOpacity="0.22" />
          <text
            x="20"
            y="18.5"
            textAnchor="middle"
            fill="#FFFFFF"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="800"
            fontSize="10.5"
            letterSpacing="-0.3"
          >
            first
          </text>
          <text
            x="20"
            y="29"
            textAnchor="middle"
            fill="#FFFFFF"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="800"
            fontSize="10.5"
            letterSpacing="-0.3"
          >
            direct
          </text>
        </svg>
      );

    case 'santander':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 40 40"
          role="img"
          aria-label="Santander logo"
          className={`shrink-0 rounded-xl shadow-sm ${className}`}
        >
          <rect width="40" height="40" rx="10" fill="#EC0000" />
          {/* Santander Flame Emblem */}
          <path
            d="M20.5 8.5c1.5 3.1-.8 5.6-2.1 7.6-1.4 2.1-1.3 4.1.4 5.9-2.8-.6-4.6-2.8-4.3-5.6.2-2.4 2.5-4.3 6-7.9Zm3.7 4.2c1.4 2.8-.5 5.1-1.8 7-1.1 1.6-1.1 3.3.3 4.8-2.3-.5-3.8-2.3-3.5-4.6.2-2 2.1-3.6 5-7.2Z"
            fill="#FFFFFF"
          />
          <ellipse cx="20" cy="28.2" rx="10.5" ry="2.8" fill="none" stroke="#FFFFFF" strokeWidth="2.2" />
        </svg>
      );

    case 'barclays':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 40 40"
          role="img"
          aria-label="Barclays logo"
          className={`shrink-0 rounded-xl shadow-sm ${className}`}
        >
          <rect width="40" height="40" rx="10" fill="#00AEEF" />
          {/* Barclays Spread Eagle Crest */}
          <path
            d="M20 10.5c1.6 0 2.8 1.2 3.3 2.5 3.2-.8 6.8-.2 9.2 1.8-2.1.4-3.8 1.4-5.1 2.8 1.4.2 2.8.8 3.8 1.8-2.4.2-4.5 1.1-6.1 2.6-.7 2.8-2.2 5.4-5.1 7.5-2.9-2.1-4.4-4.7-5.1-7.5-1.6-1.5-3.7-2.4-6.1-2.6 1-.9 2.4-1.6 3.8-1.8-1.3-1.4-3-2.4-5.1-2.8 2.4-2 6-2.6 9.2-1.8.5-1.3 1.7-2.5 3.3-2.5Z"
            fill="#FFFFFF"
          />
        </svg>
      );

    case 'monzo':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 40 40"
          role="img"
          aria-label="Monzo logo"
          className={`shrink-0 rounded-xl shadow-sm ${className}`}
        >
          <rect width="40" height="40" rx="10" fill="#14233C" />
          {/* Monzo 4-Color Ribbon M */}
          <polygon points="8,24 8,13 14,9 14,29" fill="#00A4DB" />
          <polygon points="14,9 20,16 20,25 14,19" fill="#1E7898" />
          <polygon points="26,9 20,16 20,25 26,19" fill="#FFC632" />
          <polygon points="32,24 32,13 26,9 26,29" fill="#FF4F40" />
        </svg>
      );

    case 'chip':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 40 40"
          role="img"
          aria-label="Chip logo"
          className={`shrink-0 rounded-xl shadow-sm ${className}`}
        >
          <rect width="40" height="40" rx="10" fill="#4F46E5" />
          <circle cx="20" cy="20" r="11" fill="none" stroke="#A5B4FC" strokeWidth="2" strokeDasharray="4 2" />
          <text
            x="20"
            y="23.5"
            textAnchor="middle"
            fill="#FFFFFF"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="900"
            fontSize="10.5"
          >
            chip
          </text>
        </svg>
      );

    case 'vanguard':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 40 40"
          role="img"
          aria-label="Vanguard logo"
          className={`shrink-0 rounded-xl shadow-sm ${className}`}
        >
          <rect width="40" height="40" rx="10" fill="#96151D" />
          {/* Vanguard Classic Serif V Emblem */}
          <path
            d="M10.5 11.5h6.8v2h-1.6l4.6 11.2 4.4-11.2h-1.7v-2h5.5v2h-1.4L20.8 29h-2.3l-6.6-15.5h-1.4v-2Z"
            fill="#FFFFFF"
          />
        </svg>
      );

    case 'ishares':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 40 40"
          role="img"
          aria-label="BlackRock iShares logo"
          className={`shrink-0 rounded-xl shadow-sm ${className}`}
        >
          <rect width="40" height="40" rx="10" fill="#111827" />
          <circle cx="11" cy="14" r="2.2" fill="#00E676" />
          <rect x="9.6" y="18" width="2.8" height="10" rx="1" fill="#00E676" />
          <text
            x="24.5"
            y="25.5"
            textAnchor="middle"
            fill="#FFFFFF"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="800"
            fontSize="9.2"
            letterSpacing="-0.3"
          >
            Shares
          </text>
        </svg>
      );

    case 'invesco':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 40 40"
          role="img"
          aria-label="Invesco logo"
          className={`shrink-0 rounded-xl shadow-sm ${className}`}
        >
          <rect width="40" height="40" rx="10" fill="#002C77" />
          {/* Invesco Mountain Peak + Wordmark */}
          <path
            d="M8 23.5 15.5 12l5.2 7.5 4.3-5.2L32 23.5H28.2l-3.2-4.6-4.3 5.2-5.2-7.4-4 6.8H8Z"
            fill="#38BDF8"
          />
          <text
            x="20"
            y="32"
            textAnchor="middle"
            fill="#FFFFFF"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="800"
            fontSize="7.8"
          >
            Invesco
          </text>
        </svg>
      );

    case 'apple':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 40 40"
          role="img"
          aria-label="Apple Inc. logo"
          className={`shrink-0 rounded-xl shadow-sm ${className}`}
        >
          <rect width="40" height="40" rx="10" fill="#18181B" />
          <rect x="1" y="1" width="38" height="38" rx="9" fill="none" stroke="#FFFFFF" strokeOpacity="0.18" />
          <path
            d="M24.8 20.6c0-2.6 2.1-3.9 2.2-4-1.2-1.8-3.1-2-3.7-2.1-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.9 2.6 3.2 2.5 1.3-.1 1.8-.8 3.3-.8 1.5 0 2 .8 3.3.8 1.4 0 2.3-1.2 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1-.1-2.7-1-2.7-3.7ZM22.2 12.8c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3 1.5-.6.7-1.2 2-1.1 3.1 1.2.1 2.3-.5 3-1.3Z"
            fill="#FFFFFF"
          />
        </svg>
      );

    case 'microsoft':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 40 40"
          role="img"
          aria-label="Microsoft Corp. logo"
          className={`shrink-0 rounded-xl shadow-sm ${className}`}
        >
          <rect width="40" height="40" rx="10" fill="#1E293B" />
          <rect x="9" y="9" width="10" height="10" rx="1.5" fill="#F25022" />
          <rect x="21" y="9" width="10" height="10" rx="1.5" fill="#7FBA00" />
          <rect x="9" y="21" width="10" height="10" rx="1.5" fill="#00A4EF" />
          <rect x="21" y="21" width="10" height="10" rx="1.5" fill="#FFB900" />
        </svg>
      );

    case 'nvidia':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 40 40"
          role="img"
          aria-label="NVIDIA Corp. logo"
          className={`shrink-0 rounded-xl shadow-sm ${className}`}
        >
          <rect width="40" height="40" rx="10" fill="#0F172A" />
          <rect x="1" y="1" width="38" height="38" rx="9" fill="none" stroke="#76B900" strokeOpacity="0.4" />
          <path
            d="M9 20c3.2-5.5 8.5-8 14.5-7.2 4.8.6 8 3.6 8.5 7.2-1.8 4.2-6 6.8-11 6.8-4.5 0-8-2.2-9.5-5.2 2.2 1.8 5.4 2.8 8.8 2.4 3.6-.4 6.6-2.2 7.7-4.5-1.2-2.6-4.2-4.2-8-4.2-4.2 0-8 2-11 4.7Z"
            fill="#76B900"
          />
          <circle cx="20.5" cy="19.8" r="2.6" fill="#FFFFFF" />
        </svg>
      );
  }
}
