import * as React from 'react';
import HelpdeskApp from './HelpdeskApp';
import { TicketService } from '../services/TicketService';
import type { IHelpdeskSystemProps } from './IHelpdeskSystemProps';

export default function HelpdeskSystem(props: IHelpdeskSystemProps): React.ReactElement {
  const service = React.useMemo(() => new TicketService(props.spContext), [props.spContext]);
  return <HelpdeskApp service={service} currentUserEmail={props.spContext.pageContext.user.email} />;
}
