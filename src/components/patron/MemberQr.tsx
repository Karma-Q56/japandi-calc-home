import { useEffect, useState } from "react";
import { createScanToken, SCAN_TOKEN_TTL_SECONDS } from "@/lib/scan";
import { qrSvg } from "@/lib/qr";

/**
 * The QR on a guest card carries a signed token that expires in 60 seconds.
 * It refreshes well before expiry so a guest standing at the till never shows
 * a dead code. Staff scan it, or type the printed member code.
 */
export function MemberQr({
  memberCode,
  className = "member-qr",
}: {
  memberCode: string;
  className?: string;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const next = await createScanToken(memberCode);
        if (alive) {
          setToken(next);
          setError("");
        }
      } catch {
        if (alive) setError("Could not make a fresh code. Type your member code instead.");
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 20_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [memberCode]);

  if (error) {
    return (
      <p className="gx-note" role="status">
        {error}
      </p>
    );
  }
  return (
    <div className={className}>
      {token ? (
        <div
          dangerouslySetInnerHTML={{ __html: qrSvg(token, "#26332a", "#ffffff") }}
          aria-label={`Signed card code for ${memberCode}, refreshes every 20 seconds`}
        />
      ) : (
        <div className="qr-skeleton" aria-hidden />
      )}
      <small className="gx-note">Fresh code every {SCAN_TOKEN_TTL_SECONDS / 3} seconds.</small>
    </div>
  );
}
