import { Sparkles, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "@/features/auth/AuthProvider";
import { errorMessage } from "@/shared/api/client";
import { Button } from "@/shared/ui/Button";
import { Field } from "@/shared/ui/Field";
import { StatusMessage } from "@/shared/ui/StatusMessage";

import { AuthLayout } from "./AuthLayout";
import styles from "./AuthForm.module.css";

export const PASSWORD_MIN_LENGTH = 8;

export default function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await register(username, email, password);
      navigate("/login", { state: { registered: true } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      title="Créer un compte"
      subtitle="Rejoignez-nous et commencez à créer des contenus exceptionnels dès aujourd'hui."
      visualIcon={<Sparkles />}
      visualTitle="Rejoignez la communauté GOLD FX"
      visualText="Inscription gratuite et accès immédiat à tous les outils."
    >
      <form className={styles.form} onSubmit={onSubmit}>
        {error && <StatusMessage tone="error">{error}</StatusMessage>}
        <Field
          label="Nom d'utilisateur"
          id="username"
          hint="3 à 32 caractères : lettres, chiffres, « _ », « - » ou « . »"
        >
          <input
            id="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Choisissez un nom d'utilisateur"
            required
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9_.\-]{3,32}"
            autoFocus
          />
        </Field>
        <Field label="Email" id="email">
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="votre@email.com"
            required
          />
        </Field>
        <Field
          label="Mot de passe"
          id="password"
          hint={`Minimum ${PASSWORD_MIN_LENGTH} caractères`}
        >
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Choisissez un mot de passe sécurisé"
            required
            minLength={PASSWORD_MIN_LENGTH}
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          loading={pending}
          icon={<UserPlus />}
        >
          Créer mon compte
        </Button>
        <p className={styles.switch}>
          Déjà un compte ? <Link to="/login">Se connecter</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
