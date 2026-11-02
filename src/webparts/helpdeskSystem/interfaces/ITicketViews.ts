/** Per-user opened state. This is not a ticket audit log or notification read state. */
export interface ITicketViews {
  getOpened(ticketIds:number[]):Promise<number[]>;
  markOpened(ticketId:number):Promise<void>;
  subscribe?(listener:()=>void):()=>void;
}
