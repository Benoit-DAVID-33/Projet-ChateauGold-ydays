import { Clapperboard, LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "@/features/auth/AuthProvider";
import { safeNext } from "@/features/auth/safeNext";
import { errorMessage } from "@/shared/api/client";
import { Button } from "@/shared/ui/Button";
import { Field } from "@/shared/ui/Field";
import { StatusMessage } from "@/shared/ui/StatusMessage";

import { AuthLayout } from "./AuthLayout";
import styles from "./AuthForm.module.css";

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const justRegistered = (location.state as { registered?: boolean } | null)?.registered;

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to={next} replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(identifier, password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      title="Bienvenue !"
      subtitle="Connectez-vous pour accéder à votre espace de création vidéo et image."
      visualIcon={<Clapperboard />}
      visualTitle="Créez des contenus exceptionnels"
      visualText="Éditez vos vidéos et images avec des outils professionnels. Ajoutez des formes, du texte, des objets 3D et bien plus encore."
    >
      <form className={styles.form} onSubmit={onSubmit}>
        {justRegistered && (
          <StatusMessage tone="success">
            Compte créé avec succès ! Vous pouvez maintenant vous connecter.
          </StatusMessage>
        )}
        {params.get("next") && !error && !justRegistered && (
          <StatusMessage tone="info">
            Veuillez vous connecter pour accéder à cette page.
          </StatusMessage>
        )}
        {error && <StatusMessage tone="error">{error}</StatusMessage>}
        <Field label="Nom d'utilisateur ou email" id="identifier">
          <input
            id="identifier"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Entrez votre nom d'utilisateur"
            required
            autoFocus
          />
        </Field>
        <Field label="Mot de passe" id="password">
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Entrez votre mot de passe"
            required
          />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={pending} icon={<LogIn />}>
          Se connecter
        </Button>
        <p className={styles.switch}>
          Pas encore de compte ? <Link to="/register">Créer un compte</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
