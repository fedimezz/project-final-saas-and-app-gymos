import type { Metadata } from "next";
import LegalDocument, { publisher, type LegalSection } from "@/components/legal/LegalDocument";

export const metadata: Metadata = { title: "Conditions d'utilisation — ClubX", robots: { index: true, follow: true } };
export const dynamic = "force-dynamic"; // publisher details are read from env at request time

export default function TermsPage() {
  const p = publisher();
  const sections: LegalSection[] = [
    {
      title: "Éditeur et objet",
      body: (
        <>
          <p>ClubX est une plateforme en ligne de gestion de clubs de sport (site web du club, membres, réservations, paiements, application mobile), éditée par <strong>{p.name}</strong>{p.address ? <>, {p.address}</> : null}{p.registration ? <> (immatriculation : {p.registration})</> : null}{p.email ? <>. Contact : <a className="underline" href={`mailto:${p.email}`}>{p.email}</a></> : null}.</p>
          <p>Les présentes conditions régissent l&apos;utilisation de ClubX par les propriétaires et gérants de clubs (« le Client »). Créer un club ou utiliser le service vaut acceptation.</p>
        </>
      ),
    },
    {
      title: "Compte et responsabilités",
      body: (
        <>
          <p>Le propriétaire du club crée le compte avec une adresse e-mail vérifiée et en garde les identifiants confidentiels. Il est responsable des actions faites depuis son espace et de celles de son équipe.</p>
          <p>Chaque club est isolé : un club n&apos;a accès qu&apos;à ses propres données.</p>
        </>
      ),
    },
    {
      title: "Essai gratuit de 14 jours",
      body: (
        <>
          <p>L&apos;essai gratuit dure 14 jours à compter de la création du club. Il ne demande ni carte bancaire ni paiement et est activé immédiatement. Un seul essai gratuit est accordé par personne (même adresse e-mail, y compris avec un alias, ou même numéro de téléphone).</p>
          <p>À la fin de l&apos;essai, l&apos;accès est suspendu automatiquement sauf si un abonnement payant est souscrit. Les données du club sont conservées et redeviennent accessibles dès l&apos;abonnement.</p>
        </>
      ),
    },
    {
      title: "Plans, prix et périodes de facturation",
      body: (
        <>
          <p>Les plans, leurs fonctionnalités et leurs prix sont affichés sur le site, en facturation <strong>mensuelle</strong> ou <strong>annuelle</strong> lorsque le plan propose les deux. Le prix applicable est celui affiché au moment du paiement, dans la devise indiquée ; les taxes éventuelles sont ajoutées selon la loi applicable.</p>
          <p>Les thèmes du site et les modèles 3D proposés par ClubX sont inclus dans tous les plans. L&apos;ajout de votre propre modèle 3D est réservé aux plans qui l&apos;incluent. Les limites de chaque plan (membres, coachs, réservations, etc.) sont indiquées sur la page des plans.</p>
        </>
      ),
    },
    {
      title: "Paiement",
      body: (
        <>
          <p><strong>Par carte</strong> : le paiement est traité par Stripe sur une page sécurisée ; ClubX ne voit ni ne conserve votre numéro de carte. L&apos;abonnement est activé uniquement après confirmation du paiement par Stripe.</p>
          <p><strong>Sans carte</strong> (virement, D17, Flouci, espèces) : le Client envoie une demande indiquant le plan et la période souhaités. Notre équipe l&apos;approuve ou la refuse, puis vérifie le paiement ou les conditions convenues. L&apos;abonnement n&apos;est activé qu&apos;après cette vérification ; une demande approuvée n&apos;ouvre aucun accès par elle-même.</p>
        </>
      ),
    },
    {
      title: "Durée, renouvellement et expiration",
      body: (
        <>
          <p>Chaque paiement couvre une période (un mois ou un an) à partir de son activation. Si vous renouvelez le même plan avant la fin de la période en cours, les jours restants sont conservés.</p>
          <p>Les abonnements <strong>ne sont pas reconduits automatiquement</strong> : un e-mail de rappel est envoyé quelques jours avant la fin de la période. À l&apos;échéance, après un court délai de grâce, l&apos;accès est suspendu ; les données sont conservées et l&apos;accès est rétabli dès le renouvellement.</p>
        </>
      ),
    },
    {
      title: "Résiliation et remboursement",
      body: (
        <>
          <p>Le Client peut cesser d&apos;utiliser ClubX à tout moment en ne renouvelant pas son abonnement. Sauf disposition légale impérative, une période déjà payée n&apos;est pas remboursée ; toute demande peut être adressée à notre support{p.email ? <> ({p.email})</> : null}.</p>
          <p>ClubX peut suspendre ou fermer un club qui enfreint les présentes conditions, la loi ou les droits de tiers, ou qui présente un risque de fraude ou d&apos;abus. Un club fermé pour ce motif ne peut pas être réactivé par un simple paiement.</p>
        </>
      ),
    },
    {
      title: "Données des membres",
      body: (
        <p>Pour les données de ses membres, le club est responsable du traitement et ClubX agit comme sous-traitant, selon la politique de confidentialité. Le Client s&apos;engage à informer ses membres et à disposer d&apos;une base légale pour les données qu&apos;il enregistre.</p>
      ),
    },
    {
      title: "Usage acceptable",
      body: (
        <p>Il est interdit d&apos;utiliser ClubX pour des contenus illicites, trompeurs ou portant atteinte aux droits d&apos;autrui, de tenter d&apos;accéder aux données d&apos;un autre club, de perturber le service ou de contourner les limites de son plan.</p>
      ),
    },
    {
      title: "Disponibilité et responsabilité",
      body: (
        <p>ClubX met en œuvre des moyens raisonnables pour assurer la disponibilité et la sécurité du service, sans garantie d&apos;absence d&apos;interruption. Dans les limites permises par la loi, la responsabilité de l&apos;éditeur est limitée aux sommes effectivement payées par le Client pour la période en cours, et ne couvre pas les pertes indirectes.</p>
      ),
    },
    {
      title: "Modifications et droit applicable",
      body: (
        <>
          <p>Ces conditions peuvent évoluer ; la date de mise à jour figure en haut de la page. Les changements importants sont annoncés par e-mail au propriétaire du club.</p>
          <p>Elles sont soumises au droit tunisien. Les tribunaux compétents sont ceux du ressort du siège de l&apos;éditeur, sous réserve des règles impératives applicables au Client.</p>
        </>
      ),
    },
  ];
  return (
    <LegalDocument
      title="Conditions d'utilisation"
      intro={<p>Ce document explique les règles d&apos;utilisation de ClubX : essai gratuit, plans, paiement, expiration et responsabilités.</p>}
      sections={sections}
    />
  );
}
