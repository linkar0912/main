import {
  LEGAL_ENTITY,
  grievanceOfficerContact,
  isLegalValueSupplied,
  legalPostalAddress,
  type LegalEntity,
} from "@/src/lib/legal-entity";
import styles from "./legal-entity-details.module.css";

/**
 * The operator block the legal pages and /contact share: who runs Linkar, where,
 * and who handles complaints. Fields the owner has not supplied yet are left
 * out rather than shown as placeholders.
 */
export function LegalEntityDetails({ supportEmail, entity = LEGAL_ENTITY }: { supportEmail: string; entity?: LegalEntity }) {
  const address = legalPostalAddress(entity);
  const grievance = grievanceOfficerContact(supportEmail, entity);

  return (
    <dl className={styles.details}>
      <div>
        <dt>Trade name</dt>
        <dd>{entity.tradeName}</dd>
      </div>
      {isLegalValueSupplied(entity.proprietorName) ? (
        <div>
          <dt>Proprietor</dt>
          <dd>{entity.proprietorName}</dd>
        </div>
      ) : null}
      <div>
        <dt>Business type</dt>
        <dd>{entity.entityType}, {entity.country}</dd>
      </div>
      {address ? (
        <div>
          <dt>Registered address</dt>
          <dd>{address}</dd>
        </div>
      ) : null}
      <div>
        <dt>Email</dt>
        <dd><a href={`mailto:${supportEmail}`}>{supportEmail}</a></dd>
      </div>
      <div>
        <dt>Grievance officer</dt>
        <dd>{grievance.name}, <a href={`mailto:${grievance.email}`}>{grievance.email}</a></dd>
      </div>
    </dl>
  );
}
