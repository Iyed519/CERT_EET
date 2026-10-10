/**
 * Croix rouge en haut à droite d'une modale : ferme la fenêtre sans rien
 * enregistrer (US-FORM-03). Partagée par les modales de la page Formations de
 * l'administration et par la confirmation d'inscription (US-INSC-01).
 * La carte doit porter la classe `modal-closable`.
 */
export function CroixFermeture({
  onClose,
  disabled,
}: {
  onClose: () => void;
  disabled: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      className="modal-close"
      aria-label="Fermer la fenêtre"
      onClick={onClose}
      disabled={disabled}
    >
      ×
    </button>
  );
}
