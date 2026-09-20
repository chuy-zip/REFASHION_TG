"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import buttonStyles from "@/components/ui/Button/Button.module.css";
import styles from "./PresentLink.module.css";

interface PresentLinkProps {
  href: string;
  /**
   * True when the design has logo layers and none of its compositions includes
   * the current state of the garment.
   *
   * Computed by the page, not here: it takes the layers, the compositions and
   * the working image, and a component that fetched all three to answer one
   * boolean would be doing the page's job from further away.
   */
  logosPending: boolean;
}

/**
 * The way from editing to presenting, with one question in the middle.
 *
 * **Why the question exists.** Logo layers are drawn over the canvas while
 * editing, so the garment on screen looks finished — but the layers are not
 * part of the image. Only composing flattens them, and composing is a separate
 * act that is easy to skip. Someone who paints the garment and walks straight
 * to the presentation arrives at a garment without its marks and has no reason
 * to suspect why.
 *
 * **It asks rather than blocks.** Presenting the clean garment is a legitimate
 * decision — a client may want to see the uniform plain — so this is a warning
 * and not a gate. Turning it into one would convert a useful notice into an
 * obstacle for a choice the user is allowed to make.
 *
 * **And it stays quiet when there is nothing to apply.** A design with no logo
 * layers has no pending composition, so it gets a plain link. A warning that
 * fires on every design is a warning nobody reads.
 */
export function PresentLink({ href, logosPending }: PresentLinkProps) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);

  if (!logosPending) {
    return (
      <Link className={`${buttonStyles.base} ${buttonStyles.secondary}`} href={href}>
        Presentación
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`${buttonStyles.base} ${buttonStyles.secondary}`}
        onClick={() => setAsking(true)}
      >
        Presentación
      </button>

      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        labelledBy="present-link-title"
      >
        <div className={styles.content}>
          <h2 className={styles.title} id="present-link-title">
            Los logotipos todavía no están aplicados
          </h2>
          <p className={styles.text}>
            Están colocados sobre la prenda, pero no forman parte de la imagen
            hasta que crees una composición. Si continúas, la presentación
            mostrará la prenda sin ellos.
          </p>

          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setAsking(false)}>
              Me quedo a componer
            </Button>
            <Button variant="primary" onClick={() => router.push(href)}>
              Continuar de todos modos
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
