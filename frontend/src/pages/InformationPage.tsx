import {
  Clapperboard,
  CodeXml,
  Cpu,
  Film,
  Image,
  Info,
  Layout,
  Mic,
  Plug,
  Video,
  Zap,
} from "lucide-react";

import s from "@/shared/ui/Landing.module.css";

const FEATURES = [
  {
    icon: Video,
    title: "Gestion des vidéos",
    text: "Upload, visualisation, annotation et enregistrement de vidéos avec annotations en MP4 (FFmpeg) ou WebM.",
  },
  {
    icon: Image,
    title: "Gestion des images",
    text: "Upload, visualisation, édition complète et envoi à l'API. Sauvegarde de l'image modifiée (téléchargement ou bibliothèque).",
  },
  {
    icon: Mic,
    title: "Recherche vocale",
    text: "Barre de recherche avec reconnaissance vocale en temps réel sur les pages Vidéo, Image et Recherche.",
  },
  {
    icon: Cpu,
    title: "Traitement API",
    text: "Envoi de vos médias annotés à une API externe ou à Kling AI. Traitement simultané image + texte.",
  },
];

const FORMATS = [
  { icon: Video, label: "MP4" },
  { icon: Film, label: "AVI" },
  { icon: Film, label: "MOV" },
  { icon: Film, label: "MKV / WebM" },
  { icon: Image, label: "JPG / PNG" },
  { icon: Image, label: "GIF / BMP" },
  { icon: Image, label: "WebP" },
];

const STACK = [
  { icon: CodeXml, label: "FastAPI / Python" },
  { icon: Layout, label: "React / TypeScript" },
  { icon: Zap, label: "Vite" },
  { icon: Plug, label: "API REST" },
  { icon: Clapperboard, label: "FFmpeg" },
  { icon: Mic, label: "Web Speech API" },
];

export default function InformationPage() {
  return (
    <>
      <section className={s.heroShort}>
        <div className={s.heroInner}>
          <span className={s.badge}>
            <Info /> Documentation
          </span>
          <h1 className={s.heroTitle}>
            À propos de <span className={s.accent}>l'application</span>
          </h1>
          <p className={s.heroText}>
            Tout ce que vous devez savoir sur les fonctionnalités, les formats supportés et les
            technologies utilisées.
          </p>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionInner}>
          <span className={s.sectionLabel}>Présentation</span>
          <h2 className={s.sectionTitle}>Qu'est-ce que c'est ?</h2>
          <p className={s.prose}>
            Cette application vous permet de gérer et traiter vos médias (vidéos et images) de
            manière simple et efficace. Uploadez, visualisez, annotez avec des outils professionnels
            (formes, lignes, texte, objets 3D, dessin) et envoyez vos fichiers à une API de
            traitement IA pour obtenir des résultats optimisés.
          </p>
        </div>
      </section>

      <section className={s.sectionAlt}>
        <div className={s.sectionInner}>
          <span className={s.sectionLabel}>Fonctionnalités</span>
          <h2 className={s.sectionTitle}>Ce que vous pouvez faire</h2>
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

      <section className={s.section}>
        <div className={s.sectionInner}>
          <span className={s.sectionLabel}>Compatibilité</span>
          <h2 className={s.sectionTitle}>Formats supportés</h2>
          <div className={s.tiles}>
            {FORMATS.map(({ icon: Icon, label }) => (
              <div key={label} className={s.tile}>
                <Icon />
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={s.sectionAlt}>
        <div className={s.sectionInner}>
          <span className={s.sectionLabel}>Guide</span>
          <h2 className={s.sectionTitle}>Comment utiliser</h2>
          <div className={s.steps}>
            <div className={s.step}>
              <span className={s.stepNum}>01</span>
              <h3>Choisir une page</h3>
              <p>
                Sélectionnez <em>Vidéo</em> ou <em>Image</em> dans le menu de navigation.
              </p>
            </div>
            <div className={s.step}>
              <span className={s.stepNum}>02</span>
              <h3>Charger un fichier</h3>
              <p>Cliquez sur « Charger » ou glissez-déposez votre fichier dans la zone dédiée.</p>
            </div>
            <div className={s.step}>
              <span className={s.stepNum}>03</span>
              <h3>Annoter & exporter</h3>
              <p>Utilisez les outils d'édition, puis téléchargez ou envoyez à l'API.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionInner}>
          <span className={s.sectionLabel}>Stack</span>
          <h2 className={s.sectionTitle}>Technologies utilisées</h2>
          <div className={s.tiles}>
            {STACK.map(({ icon: Icon, label }) => (
              <div key={label} className={s.tile}>
                <Icon />
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
