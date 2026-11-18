import {
  ArrowRight,
  Box,
  Brush,
  CirclePlay,
  CloudUpload,
  Cpu,
  Eraser,
  Image,
  Mic,
  PenTool,
  Save,
  Shapes,
  Sparkles,
  Type,
  Video,
  Workflow,
  ZoomIn,
} from "lucide-react";
import { Link } from "react-router-dom";

import buttonStyles from "@/shared/ui/Button.module.css";
import s from "@/shared/ui/Landing.module.css";

const HERO_VIDEO =
  "https://res.cloudinary.com/dpzdebmmn/video/upload/v1778071466/video_fond2_kctuhz.mp4";

const FEATURES = [
  {
    icon: CloudUpload,
    title: "Upload Multi-formats",
    text: "MP4, AVI, MOV, MKV, WebM pour les vidéos. JPG, PNG, GIF, BMP, WebP pour les images. Glisser-déposer supporté.",
  },
  {
    icon: PenTool,
    title: "Édition Avancée",
    text: "7 formes, 3 types de lignes, texte, dessin au feutre avec gomme, objets 3D. Calques et timeline ; tout reste fixé à votre média.",
  },
  {
    icon: Workflow,
    title: "Workflows",
    text: "Enchaînez média, annotations, prompt, génération Kling et export dans un graphe de nœuds, puis réutilisez-le.",
  },
  {
    icon: Video,
    title: "Enregistrement Vidéo",
    text: "Exportez la vidéo entière avec toutes vos annotations. Conversion automatique en MP4 avec bande-son via FFmpeg.",
  },
  {
    icon: Cpu,
    title: "Atelier IA",
    text: "Prompt, paramètres et sorties côte à côte : texte vers image, texte vers vidéo, image vers vidéo et Omni-Video avec Kling AI, ou envoi à votre API.",
  },
  {
    icon: Mic,
    title: "Reconnaissance Vocale",
    text: "Dictez vos requêtes directement dans la barre de recherche. Transcription en temps réel dans les navigateurs compatibles.",
  },
];

const TOOLS = [
  { icon: Shapes, label: "Formes (7 types)" },
  { icon: ArrowRight, label: "Lignes & Flèches" },
  { icon: Type, label: "Texte libre" },
  { icon: Brush, label: "Dessin feutre" },
  { icon: Eraser, label: "Gomme" },
  { icon: ZoomIn, label: "Zoom interactif" },
  { icon: Save, label: "Sauvegarde" },
  { icon: Box, label: "Objets 3D" },
];

function Cta({ variant = "primary" }: { variant?: "primary" | "outline" }) {
  return (
    <div className={s.ctaRow}>
      <Link
        to="/video"
        className={`${buttonStyles.btn} ${buttonStyles.primary} ${buttonStyles.lg}`}
      >
        <CirclePlay /> {variant === "primary" ? "Commencer avec les Vidéos" : "Aller aux Vidéos"}
      </Link>
      <Link
        to="/image"
        className={`${buttonStyles.btn} ${buttonStyles.outline} ${buttonStyles.lg}`}
      >
        <Image /> {variant === "primary" ? "Commencer avec les Images" : "Aller aux Images"}
      </Link>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <video className={s.heroVideo} autoPlay muted loop playsInline aria-hidden>
        <source src={HERO_VIDEO} type="video/mp4" />
      </video>
      <div className={s.heroBg} aria-hidden />

      <section className={s.hero}>
        <div className={s.heroInner}>
          <span className={s.badge}>
            <Sparkles /> Propulsé par l'IA
          </span>
          <h1 className={s.heroTitle}>
            Gérez, éditez et analysez
            <br />
            vos <span className={s.accent}>vidéos & images</span>
            <br />
            avec l'IA
          </h1>
          <p className={s.heroText}>
            Uploadez vos médias, annotez-les avec des outils professionnels, enregistrez des vidéos
            avec annotations et envoyez-les à votre API de traitement en un clic.
          </p>
          <Cta />
          <div className={s.stats}>
            {[
              ["5+", "Formats vidéo"],
              ["5+", "Formats image"],
              ["3D", "Objets animés"],
              ["IA", "API intégrée"],
            ].map(([value, label]) => (
              <div key={label} className={s.stat}>
                <span className={s.statValue}>{value}</span>
                <span className={s.statLabel}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionInner}>
          <span className={s.sectionLabel}>Fonctionnalités</span>
          <h2 className={s.sectionTitle}>Tout ce dont vous avez besoin</h2>
          <div className={s.cards}>
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <article key={title} className={s.card}>
                <div className={s.cardIcon}>
                  <Icon />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={s.sectionAlt}>
        <div className={s.sectionInner}>
          <span className={s.sectionLabel}>Processus</span>
          <h2 className={s.sectionTitle}>Comment ça marche</h2>
          <div className={s.steps}>
            {[
              [
                "01",
                "Uploadez votre média",
                "Glissez-déposez ou sélectionnez votre vidéo ou image. Tous les formats courants sont acceptés.",
              ],
              [
                "02",
                "Annotez & éditez",
                "Ajoutez formes, texte, dessins et objets 3D directement sur votre média avec les outils intégrés.",
              ],
              [
                "03",
                "Exportez & envoyez",
                "Téléchargez votre média modifié ou envoyez-le à l'API IA pour traitement avancé.",
              ],
            ].map(([num, title, text], index) => (
              <div key={num} style={{ display: "contents" }}>
                {index > 0 && <ArrowRight className={s.stepArrow} aria-hidden />}
                <div className={s.step}>
                  <span className={s.stepNum}>{num}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionInner}>
          <span className={s.sectionLabel}>Outils</span>
          <h2 className={s.sectionTitle}>Des outils pensés pour vous</h2>
          <div className={s.tiles}>
            {TOOLS.map(({ icon: Icon, label }) => (
              <div key={label} className={s.tile}>
                <Icon />
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={s.sectionAlt}>
        <div className={s.sectionInner} style={{ maxWidth: 700, textAlign: "center" }}>
          <h2 className={s.sectionTitle} style={{ marginBottom: 12 }}>
            Prêt à transformer vos médias ?
          </h2>
          <p className={s.heroText}>Commencez gratuitement, sans installation complexe.</p>
          <Cta variant="outline" />
        </div>
      </section>
    </>
  );
}
