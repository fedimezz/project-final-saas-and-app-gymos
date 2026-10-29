import type { Metadata } from "next";
import LegalDocument, { publisher, type LegalSection } from "@/components/legal/LegalDocument";

export const metadata: Metadata = { title: "Politique de confidentialité — ClubX", robots: { index: true, follow: true } };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const p = publisher();
  const contact = p.email ? <a className="underline" href={`mailto:${p.email}`}>{p.email}</a> : <>notre support</>;
  const sections: LegalSection[] = [
    {
      title: "Qui est responsable de vos données",
      body: (
        <>
          <p>Pour les comptes des propriétaires de clubs et la facturation, le responsable du traitement est <strong>{p.name}</strong>{p.address ? <>, {p.address}</> : null}. Pour les données des membres d&apos;un club, c&apos;est le club lui-même ; ClubX n&apos;agit alors que pour son compte (sous-traitant).</p>
          <p>Contact : {contact}.</p>
        </>
      ),
    },
    {
      title: "Données collectées",
      body: (
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Compte du propriétaire</strong> : nom, adresse e-mail (vérifiée), téléphone (facultatif), mot de passe (stocké chiffré, jamais en clair).</li>
          <li><strong>Club</strong> : nom, adresse du site, contenus, images, réglages, plan et période d&apos;abonnement.</li>
          <li><strong>Paiement</strong> : montant, période, statut et référence de transaction. Les cartes bancaires sont saisies chez Stripe ; ClubX n&apos;en conserve pas le numéro. Pour un paiement sans carte : moyen choisi, téléphone de contact, référence de vérification.</li>
          <li><strong>Membres du club</strong> : les informations que le club enregistre (identité, contact, abonnement, réservations).</li>
          <li><strong>Technique</strong> : journaux de sécurité et d&apos;audit, adresse IP (limitation d&apos;abus), cookie de session.</li>
        </ul>
      ),
    },
    {
      title: "Pourquoi nous les utilisons",
      body: (
        <p>Fournir et sécuriser le service, gérer l&apos;essai et l&apos;abonnement, traiter les paiements, envoyer les e-mails de service (vérification, rappels de renouvellement, expiration), prévenir la fraude et les abus, et respecter nos obligations légales. Nous ne vendons pas vos données et n&apos;affichons pas de publicité.</p>
      ),
    },
    {
      title: "Prestataires qui peuvent traiter des données",
      body: (
        <ul className="list-disc space-y-1 pl-5">
          <li>Stripe : paiement par carte.</li>
          <li>Resend : envoi des e-mails de service.</li>
          <li>Cloudinary : stockage d&apos;images.</li>
          <li>Upstash : limitation des tentatives (anti-abus).</li>
          <li>Hébergeur et base de données de la plateforme.</li>
        </ul>
      ),
    },
    {
      title: "Cookies",
      body: <p>ClubX utilise uniquement des cookies strictement nécessaires (session de connexion, protection contre les attaques, transfert sécurisé après création du club). Aucun cookie publicitaire.</p>,
    },
    {
      title: "Durée de conservation",
      body: (
        <p>Les données sont conservées tant que le club existe. À l&apos;expiration d&apos;un essai ou d&apos;un abonnement, elles ne sont pas supprimées : elles redeviennent accessibles au renouvellement. Vous pouvez demander leur suppression à tout moment ; les données de facturation peuvent être conservées pendant la durée légale exigée.</p>
      ),
    },
    {
      title: "Vos droits",
      body: (
        <>
          <p>Vous pouvez demander l&apos;accès, la rectification ou la suppression de vos données, vous opposer à un traitement ou en demander la limitation, en écrivant à {contact}. Les membres d&apos;un club doivent d&apos;abord s&apos;adresser à leur club.</p>
          <p>Vous pouvez aussi saisir l&apos;Instance nationale de protection des données personnelles (INPDP) en Tunisie, ou l&apos;autorité de votre pays de résidence.</p>
        </>
      ),
    },
    {
      title: "Sécurité et transferts",
      body: (
        <p>Connexions chiffrées (HTTPS), mots de passe hachés, isolation stricte des données entre clubs et journaux d&apos;audit. Certains prestataires sont situés hors de Tunisie ; les données qui leur sont transmises sont limitées à ce qui est nécessaire au service.</p>
      ),
    },
    {
      title: "Modifications",
      body: <p>Cette politique peut évoluer ; la date de mise à jour figure en haut de la page.</p>,
    },
  ];
  return (
    <LegalDocument
      title="Politique de confidentialité"
      intro={<p>Ce document décrit les données que ClubX traite, pourquoi, avec qui, et comment exercer vos droits.</p>}
      sections={sections}
    />
  );
}
