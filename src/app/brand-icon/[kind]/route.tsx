import { ImageResponse } from "next/og";

// PNG app icons rendered from the InSync. mark (navy tile). kinds: 192, 512, maskable, apple
const MARK = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 330 200"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16F2DC"/><stop offset=".55" stop-color="#E9FFFC"/><stop offset="1" stop-color="#0B9E92"/></linearGradient><linearGradient id="b" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16F2DC"/><stop offset=".45" stop-color="#F2FFFD"/><stop offset="1" stop-color="#0A8F85"/></linearGradient></defs><path d="M118 24C62 2 14 46 26 104c10 48 66 72 114 44l56-48" fill="none" stroke="url(#a)" stroke-width="42" stroke-linecap="round"/><path d="M212 176c56 22 104-22 92-80-10-48-66-72-114-44l-56 48" fill="none" stroke="url(#b)" stroke-width="42" stroke-linecap="round"/></svg>`)}`;

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  const size = kind === "512" || kind === "maskable" ? 512 : kind === "apple" ? 180 : 192;
  const pad = kind === "maskable" || kind === "apple" ? 0.22 : 0.14; // maskable keeps the mark in the safe zone
  const radius = kind === "maskable" || kind === "apple" ? 0 : Math.round(size * 0.22);
  const w = Math.round(size * (1 - pad * 2));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg, #0b1b36, #071328)", borderRadius: radius }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARK} width={w} height={Math.round((w * 200) / 330)} alt="" />
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
