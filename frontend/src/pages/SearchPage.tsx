import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { SearchBar } from "@/features/search/SearchBar";
import { errorMessage } from "@/shared/api/client";
import { searchApi } from "@/shared/api/endpoints";
import { StatusMessage } from "@/shared/ui/StatusMessage";

import styles from "./Page.module.css";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "medium" });

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q")?.trim() ?? "";

  const result = useQuery({
    queryKey: ["search", query],
    queryFn: () => searchApi.search(query),
    enabled: query.length > 0,
    staleTime: Infinity,
  });

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Recherche</h1>
      <SearchBar
        key={query}
        initialValue={query}
        pending={result.isFetching}
        onSubmit={(q) => q && setParams({ q })}
      />

      {query ? (
        <section className={styles.card}>
          <h2>Résultats de recherche pour : « {query} »</h2>
          {result.isFetching && (
            <StatusMessage tone="loading">Traitement de votre requête par l'API...</StatusMessage>
          )}
          {result.isError && (
            <StatusMessage tone="error">{errorMessage(result.error)}</StatusMessage>
          )}
          {result.data && (
            <>
              <StatusMessage tone="success">
                {result.data.response || "Requête traitée avec succès"}
              </StatusMessage>
              <p>
                <strong>Requête :</strong> « {result.data.query} »
              </p>
              <p>
                <strong>Horodatage :</strong>{" "}
                {result.data.timestamp ? dateFormat.format(new Date(result.data.timestamp)) : "N/A"}
              </p>
            </>
          )}
        </section>
      ) : (
        <section className={styles.card}>
          <h2>Rechercher vos médias</h2>
          <p>Utilisez la barre de recherche ci-dessus pour interroger l'API de traitement.</p>
          <p>Tapez votre requête (ou dictez-la au micro) et appuyez sur Entrée.</p>
          <p className={styles.muted}>
            Vos médias sont consultables dans la <Link to="/bibliotheque">bibliothèque</Link>.
          </p>
        </section>
      )}
    </div>
  );
}
