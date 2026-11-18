import { Link } from "react-router-dom";

import styles from "./Page.module.css";

export default function NotFoundPage() {
  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <h2>Page introuvable</h2>
        <p>La page demandée n'existe pas ou a été déplacée.</p>
        <p>
          <Link to="/">Retour à l'accueil</Link>
        </p>
      </section>
    </div>
  );
}
