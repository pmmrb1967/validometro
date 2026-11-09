// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The Validómetro mark: a gauge split into the traffic light (fresh → soon → expired) with a
 * leaf as the needle, pointing at "fresh". Same drawing as public/icon.svg, without the tile.
 * `size` is the width; the mark is a half-dial, a little over half as tall.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={Math.round((size * 186) / 332)}
      viewBox="90 170 332 186"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" strokeWidth="48">
        <path d="M106 330A150 150 0 0 1 167.8 208.6" stroke="#4cb873" />
        <path d="M185.6 197.6A150 150 0 0 1 326.4 197.6" stroke="#f2b33d" />
        <path d="M344.2 208.6A150 150 0 0 1 406 330" stroke="#ef5b4c" />
      </g>
      <g transform="rotate(-36 256 330)">
        <path d="M256 340V296" stroke="var(--leaf)" strokeWidth="16" strokeLinecap="round" />
        <path d="M256 306C214 286 208 236 256 188C304 236 298 286 256 306Z" fill="var(--leaf)" />
        <path d="M256 294V214" stroke="var(--leaf-vein)" strokeWidth="8" strokeLinecap="round" />
      </g>
    </svg>
  );
}
