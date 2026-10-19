import * as React from 'react';
import { Icon, MessageBar, MessageBarType, Spinner } from '@fluentui/react';
import type { ITicketAttachment, ITicketDataSource } from '../interfaces/ITicketDataSource';
import { AttachmentFiles } from './AttachmentFiles';
import styles from './HelpdeskSystem.module.scss';
export function TicketAttachments(props:{id:number;service?:ITicketDataSource;refreshKey?:number}): React.ReactElement {
  const [saved,setSaved] = React.useState<ITicketAttachment[]>([]);
  const [loading,setLoading] = React.useState(false);
  const [error,setError] = React.useState('');
  const generation = React.useRef(0);
  const load = React.useCallback(async ():Promise<void> => {
    const request = ++generation.current;setLoading(true);
    try {
      if (!props.service?.getAttachments) throw new Error('Attachments are not available in this host.');
      const attachments = await props.service.getAttachments(props.id);
      if (request === generation.current) {setSaved(attachments);setError('');}
    } catch (reason) {if (request === generation.current) setError(reason instanceof Error ? reason.message : 'Unable to load attachments.');}
    finally {if (request === generation.current) setLoading(false);}
  },[props.id,props.service,props.refreshKey]);
  React.useEffect(() => {void load();return () => {generation.current++;};},[load]);
  return <div className={styles.detailSection}>
    <div className={styles.detailSectionHeading}><Icon iconName="Attach" /><h3>Attachments</h3></div>
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {loading ? <Spinner label="Loading attachments..." /> : saved.length ? <AttachmentFiles files={saved} /> : !error && <p>No ticket attachments yet.</p>}
  </div>;
}
