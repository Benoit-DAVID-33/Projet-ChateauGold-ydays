import { useMutation } from "@tanstack/react-query";
import { Layers, Mail, Rocket, Send } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useAuth } from "@/features/auth/AuthProvider";
import { errorMessage } from "@/shared/api/client";
import { contactApi } from "@/shared/api/endpoints";
import { Button } from "@/shared/ui/Button";
import { Field } from "@/shared/ui/Field";
import s from "@/shared/ui/Landing.module.css";
import { StatusMessage } from "@/shared/ui/StatusMessage";

import styles from "./ContactPage.module.css";

export default function ContactPage() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.username ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [message, setMessage] = useState("");

  const send = useMutation({
    mutationFn: () => contactApi.send(name, email, message),
    onSuccess: () => setMessage(""), // on garde nom/email, on vide le message
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send.mutate();
  };

  return (
    <>
      <section className={s.heroShort}>
        <div className={s.heroInner}>
          <span className={s.badge}>
            <Mail /> Nous écrire
          </span>
          <h1 className={s.heroTitle}>
            Contactez-<span className={s.accent}>nous</span>
          </h1>
          <p className={s.heroText}>
            Une question, une suggestion ou un problème technique ? On vous répond rapidement.
          </p>
        </div>
      </section>

      <section className={s.section}>
        <div className={`${s.sectionInner} ${styles.grid}`}>
          <form className={styles.form} onSubmit={onSubmit} noValidate={false}>
            <h2>
              <Send /> Envoyer un message
            </h2>
            <Field label="Nom" id="name">
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Votre nom"
                required
                maxLength={200}
              />
            </Field>
            <Field label="Email" id="email">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
              />
            </Field>
            <Field label="Message" id="message">
              <textarea
                id="message"
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Votre message..."
                required
                maxLength={5000}
              />
            </Field>
            <Button type="submit" variant="primary" block icon={<Send />} loading={send.isPending}>
              Envoyer
            </Button>
            {send.isSuccess && (
              <StatusMessage tone="success">Votre message a été envoyé avec succès !</StatusMessage>
            )}
            {send.isError && <StatusMessage tone="error">{errorMessage(send.error)}</StatusMessage>}
          </form>

          <div className={styles.infos}>
            <article className={s.card}>
              <div className={s.cardIcon}>
                <Mail />
              </div>
              <h3>Email</h3>
              <p>contact@projet-ydays.com</p>
            </article>
            <article className={s.card}>
              <div className={s.cardIcon}>
                <Layers />
              </div>
              <h3>Projet</h3>
              <p>YDays — Application de gestion de médias avec IA</p>
            </article>
            <article className={s.card}>
              <div className={s.cardIcon}>
                <Rocket />
              </div>
              <h3>Version</h3>
              <p>{__APP_VERSION__} — Refonte complète</p>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
