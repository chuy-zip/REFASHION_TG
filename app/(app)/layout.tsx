import { AppTopBar } from "@/components/layout/AppTopBar/AppTopBar";
import styles from "./layout.module.css";

/**
 * App shell for every signed-in page: a persistent top bar plus the content
 * area. The bar renders once here, so route-level loading.tsx shows its
 * skeleton below a bar that never flickers.
 *
 * Auth is enforced upstream by proxy.ts; admin pages re-check the role.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.shell}>
      {/* First thing in the tab order, invisible until it has focus. The bar is
          about six stops — marca, dos destinos, "+ Nuevo diseño", el correo y
          salir — y son las mismas seis en cada pantalla. Sin esto, llegar al
          contenido con teclado cuesta ese peaje cada vez que se navega.

          It targets the shell's content wrapper rather than each page's <main>
          because the wrapper is written once; nine <main> tags with an id are
          nine chances to forget one. */}
      <a className={styles.skip} href="#contenido">
        Saltar al contenido
      </a>

      <AppTopBar />

      {/* tabIndex -1 so the caret actually lands here. Without it the browser
          scrolls to the anchor and leaves focus at the top of the document, so
          the next Tab walks the bar all over again — the link would look like
          it worked and would not have. */}
      <div className={styles.content} id="contenido" tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
