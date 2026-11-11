export interface IDocumentationTopic {
  id:string; featureOverview?:boolean; section:string; title:string; summary:string; keywords:string;
  paragraphs?:string[]; sections?:Array<{id:string;title:string;paragraphs:string[]}>; steps?:string[]; note?:string; related?:string[];
}
/** Product help is bundled with the app. No tickets or personal data are searched here. */
export const documentationTopics:IDocumentationTopic[]=[
  {id:'start',section:'Getting Started',title:'Welcome to DeskPilot',summary:'Find help, report an issue, and follow the work until it is complete.',keywords:'introduction manual application guide support helpdesk how to use',paragraphs:[
    'DeskPilot keeps support requests in one place. Each request becomes a ticket with a title, description, status, and the person handling it.',
    'Use Dashboard for an overview, Tickets to work on requests, and Knowledge Base to read helpful articles. Settings contains the tools available to Helpdesk Admins.',
    'The buttons and tickets you see depend on your role and workspace access. This manual describes the standard roles; your organisation may adjust their permissions.'
  ],related:['interface','roles','create','quick-help']},
  {id:'interface',section:'Getting Started',title:'Get to Know the Interface',summary:'Learn what the main parts of the screen show and what their controls do.',keywords:'interface screen layout tour controls buttons icons navigation header top bar bell notification initials avatar badge menu toolbar search filter sort tabs sidebar gear',sections:[
    {id:'header',title:'The Top Bar',paragraphs:[
      'The top bar shows DeskPilot and the name of your support workspace. Check the workspace name if your organisation uses more than one helpdesk.',
      'The moon or sun switches between light and dark mode. The bell opens your notifications; a number on the bell indicates unread notifications. Your name or initials identifies the signed-in account and opens its account menu.',
      'A settings icon may also appear here. These workspace-level settings are separate from the main Settings tab and may require a Super Admin.'
    ]},
    {id:'main-tabs',title:'The Main Tabs',paragraphs:[
      'Dashboard shows totals, charts, and support performance. Tickets is the working list of requests. Knowledge Base contains reusable guidance. Settings contains the management sections available to your role. User Guide is this application manual.',
      'The highlighted tab shows where you are. Changing tabs changes the part of DeskPilot you are viewing; it does not change the status of a ticket.'
    ]},
    {id:'ticket-list',title:'The Ticket List',paragraphs:[
      'The page title tells you which list you are viewing. New opens the ticket creation form. The views below the title, such as All Tickets, My Assigned Tickets, and Created by Me, choose whose requests to display within your access.',
      'Search narrows the visible results. Status and date filters narrow them further. The ticket count describes the current results, not necessarily every ticket in the workspace. Sort controls change the order of the results.',
      'Each ticket row or mobile card shows its number, title, and available details such as status, priority, or assignee. A sparkle beside a title means you have not opened that ticket yet. A status badge describes its current stage; priority describes its urgency.',
      'Refresh checks for the latest data. Desktop column controls change which fields appear in the table. Export downloads the available results. On mobile, some of these actions are grouped in the configuration menu beside Search.'
    ]},
    {id:'ticket-screen',title:'Inside a Ticket',paragraphs:[
      'The main area shows the ticket title, who submitted it, its date, status, and description. The details column shows information such as the assignee, requester, priority, and classification.',
      'Comments holds the conversation. Attachments lists the supporting files. Activity shows recorded updates. A Resolution Summary tab appears when a resolution exists. Only the content of the selected tab is shown.',
      'Resolve and its adjacent status dropdown change the workflow. Edit opens the editable ticket fields. The history control shows saved versions. A disabled control is not available for your role or for that ticket.',
      'The comment editor expands when selected. Formatting appears above the message, while attachments and Post are inside the editor. File chips show the files selected for that message.'
    ]},
    {id:'knowledge-screen',title:'The Knowledge Base',paragraphs:[
      'Category tabs group the articles. Search helps you find guidance by its title, content, or keywords. An article row shows its title, content, classification, and publication status where those columns are available.',
      'New Article opens the article editor for Agents and Helpdesk Admins. A title displayed as an editable link can be selected to edit that article. Published articles can also appear in Quick Help.'
    ]},
    {id:'settings-screen',title:'The Settings Layout',paragraphs:[
      'The section menu chooses an area such as Users & Roles, Support Teams, Assignment, or Email & Notifications. The panel on the right contains the controls for that section. Some sections have their own tabs for different views.',
      'Switches turn options on or off. Text fields and selection lists hold values. Save applies an edit when a Save action is provided; Discard returns to the saved values where available. Some switches save immediately, so read the confirmation or error shown afterward.',
      'A chevron on a mobile settings row opens its details. The hamburger button beside Settings opens the section menu on smaller screens.'
    ]},
    {id:'feedback',title:'Messages, Loading, and Help',paragraphs:[
      'A spinner means data or an action is still loading. Success messages confirm an action. Warnings may explain that one part succeeded while another needs attention. Error messages explain what could not be completed; read them before retrying.',
      'Need Help opens Quick Help, which guides you through published support articles. It is different from the notification bell and is not a live chat with an agent.',
      'On mobile, the account name may be replaced by initials, tables may become lists or cards, and actions may move into menus. The main functions remain the same, although the arrangement changes to fit the screen.'
    ]}
  ],note:'The available screens and actions depend on your role and workspace permissions. A hidden or disabled control does not always mean something is broken.',related:['navigation','roles','create','find','quick-help']},
  {id:'roles',section:'Getting Started',title:'Understand Your Role',summary:'What Agents and Helpdesk Admins can do.',keywords:'permissions access rights account users administrator agent visibility who can edit',paragraphs:[
    'Agents handle support requests. They can create tickets, choose an assignee during creation, comment, and update the status of tickets they are allowed to work on. They can see tickets assigned to them and tickets they created or requested, subject to workspace access.',
    'Agents can assign tickets they created themselves. Being assigned someone else’s ticket does not let an agent pass it to another person. Agents cannot close tickets.',
    'Agents can create Knowledge Base articles directly and edit articles they created. They can also edit an article they published, or one a Helpdesk Admin has opened for agent editing.',
    'Helpdesk Admins manage support work, teams, users, assignment settings, email notifications, classifications, and SLA targets. They can create and edit any Knowledge Base article and close tickets.',
    'Creating a ticket is different from being its requester. The creator entered the record; the requester is the person who needs help. A Helpdesk Admin cannot change another person’s ticket title or description. Changing an existing ticket’s requester requires a Super Admin.'
  ],note:'Workspace connections, Ticket List Schema, and certain site-level settings require a Super Admin. Contact one if a required setting is unavailable.',related:['edit','assign','knowledge-edit','users']},
  {id:'navigation',section:'Getting Started',title:'Find Your Way Around',summary:'Use the navigation, mobile controls, and display options.',keywords:'mobile phone tabs menu hamburger theme dark light appearance desktop',steps:[
    'Choose a main tab at the top to open Dashboard, Tickets, Knowledge Base, Settings, or User Guide.',
    'On a small screen, swipe the main tab row if needed. The selected tab moves into view when you change pages.',
    'In mobile Settings, use the menu button beside Settings to choose a section.',
    'Use the moon or sun button in the top bar to change the theme. DeskPilot remembers the choice in this browser.'
  ],related:['find','notifications']},
  {id:'quick-help',section:'Getting Started',title:'Try Quick Help Before Raising a Ticket',summary:'Use published Knowledge Base guidance to find a possible answer.',keywords:'chatbot bot need help self service answer nothing matches create a ticket',steps:[
    'Open Need Help near the edge of the screen. On mobile it may appear as an icon without text.',
    'Choose the category and follow the available questions or articles.',
    'Read the guidance and choose whether it solved your issue. Use Back or Start Again to explore another path.',
    'If you still need help, choose Create a Ticket. Check the details carried into the form and add anything the support team needs.'
  ],note:'Quick Help uses published articles. It is a guided help tool, not a live conversation with an agent.',related:['create','knowledge-read']},
  {id:'create',section:'Working With Tickets',title:'Create a Ticket',summary:'Describe a request clearly and choose who will handle it.',keywords:'new add report raise log issue problem phone call on behalf requested by assignment priority attachments',steps:[
    'Open Tickets and select New.',
    'Enter a clear title. In Description, explain what happened, what you expected, and any error message. Include the affected service or device.',
    'Use Attach Files at the bottom-left of the description editor to include a screenshot or document.',
    'Choose Priority. Agents can also choose Assigned To while creating their own ticket. A ticket with an assignee starts In Progress.',
    'Open Show All Fields to enter Ticket Type, Due Date and Time, Category, Subcategory, Issue Type, and requester details as needed. Choose a department if the workspace requires it.',
    'Select Create Ticket and wait for confirmation. If you are reporting a phone call for someone else, check the requester name and email before saving.'
  ],note:'If creation succeeds but an attachment fails, use Retry Uploads for the existing ticket. Do not create a second ticket.',related:['priority','attachments','assign','edit']},
  {id:'find',section:'Working With Tickets',title:'Find, Filter, and Sort Tickets',summary:'Narrow the list to the requests you need.',keywords:'search missing ticket newest oldest highest priority all assigned created by me filter export mobile calendar',steps:[
    'Use All Tickets, My Assigned Tickets, or Created by Me to choose a view. All Tickets means all tickets your account is allowed to see.',
    'Enter a search term and use status or date filters to narrow the results.',
    'On mobile, use the date button beside Search and the configuration menu for Refresh, Export, Archives, and Advanced Filter.',
    'Use the mobile sort control to choose Newest First, Oldest First, or Highest Priority First.',
    'Open a ticket title or card to see its full details.'
  ],note:'The unread sparkle means you have not opened that ticket yet. It does not indicate urgency.',related:['missing','status','updates']},
  {id:'status',section:'Working With Tickets',title:'Understand Ticket Status',summary:'Know the difference between New, In Progress, Pending, Resolved, and Closed.',keywords:'complete completed done awaiting closure resolve close paused hold workflow counts zero dashboard',paragraphs:[
    'New means the request has been recorded and has no assignee. In Progress means it has been assigned for work.',
    'Pending means the work is waiting, for example for more information or an outside party. Explain what is needed in a comment.',
    'Resolved means the work has been completed and a resolution has been recorded. Closed means the ticket has also been formally closed by a Helpdesk Admin.',
    'The Resolved ticket filter includes both resolved and closed tickets, so completed work does not disappear from that total after closure. The Closed filter shows only closed tickets. The dashboard status chart shows current statuses separately.'
  ],related:['resolve','sla','dashboard']},
  {id:'assign',section:'Working With Tickets',title:'Assign a Ticket',summary:'Choose an assignee and understand automatic assignment.',keywords:'assigned to transfer route routing round robin team lead reassign automatic auto assignment',paragraphs:[
    'An agent can choose Assigned To when creating a ticket, and can change the assignee later on tickets they created. Agents cannot reassign someone else’s ticket just because it is assigned to them.',
    'Helpdesk Admins can manage ticket assignments according to their workspace permissions. An assigned ticket is treated as In Progress.',
    'When automatic assignment is enabled, DeskPilot matches the ticket’s category to a support team and uses its assignment method. Round Robin rotates between available members; Team Lead uses the configured lead.'
  ],note:'Automatic assignment in the SharePoint app runs during DeskPilot ticket creation. Tickets added by email, Forms, or external flows need their own background automation; merely appearing in the list does not run the create action again.',related:['teams','create','updates']},
  {id:'edit',section:'Working With Tickets',title:'Edit Ticket Details',summary:'Understand which fields you can change after creation.',keywords:'edit pencil disabled grey read only title description requester name email requested by history due date',steps:[
    'Open the ticket and select Edit.',
    'Update the fields available to you. Only the ticket creator can change its title and description, unless a Super Admin makes the correction.',
    'Use Show All Fields for the additional ticket information. It changes to Show Less when expanded.',
    'Add any new attachments inside the description editor, then select Save Changes.'
  ],note:'Requester details are locked after creation for Agents and Helpdesk Admins. A Super Admin must unlock them with the requester pencil before changing them. The change is shown in ticket history when the saved versions are available.',related:['roles','assign','activity']},
  {id:'comments',section:'Working With Tickets',title:'Add or Delete a Comment',summary:'Keep progress, questions, and replies with the ticket.',keywords:'message communication chat conversation reply post note delete remove ten minutes 10 minutes',steps:[
    'Open the ticket’s Comments tab and select Add a comment.',
    'Write the update. Use formatting and Attach Files if needed, then select Post.',
    'Use the small refresh icon to reload comments or the sort icon to change their order.',
    'To remove your own recent comment, open its menu and choose Delete when available. The deletion window is 10 minutes from posting.'
  ],note:'You cannot delete another person’s comment. A comment marked as the solution must have that selection cleared before it can be deleted. DeskPilot has no separate general chat portal; ticket comments are its conversation area.',related:['attachments','resolve','activity']},
  {id:'attachments',section:'Working With Tickets',title:'Attach and Open Files',summary:'Add supporting files and find them again later.',keywords:'upload download screenshot document image pdf word jpg png mp4 file size limit attachment',steps:[
    'Choose Attach Files inside the ticket description or active comment editor.',
    'Check the selected file chips. Use the small remove button to remove a file before saving or posting.',
    'Open the Attachments tab on a ticket to see its files, download them, or upload more where your permissions allow it.'
  ],note:'Each selection supports up to 10 files, with a maximum of 5 MB per file. Supported types include PDF, Word documents, MP4, JPEG/JPG, WebP, and PNG. Whether a file previews or downloads depends on its type and how it was stored.',related:['create','comments']},
  {id:'resolve',section:'Working With Tickets',title:'Resolve and Close a Ticket',summary:'Record what fixed the issue and finish the request.',keywords:'resolution summary solution requester email completed close status dropdown notification',steps:[
    'Open the ticket and select Resolve. The adjacent dropdown contains the other statuses available to your role.',
    'Enter a useful resolution: say what was done and any next step the requester needs to take.',
    'Confirm the action. Requester emails follow the workspace’s notification settings and need a valid requester email address.',
    'Review the Resolution Summary tab when one is present. A Helpdesk Admin can close the ticket after it has been resolved.'
  ],note:'Agents do not have the Close action. Recording a resolution and sending an email are separate outcomes; check any notification warning shown after saving.',related:['status','notifications','comments']},
  {id:'activity',section:'Working With Tickets',title:'Review Activity and History',summary:'See comments, saved changes, and who made them.',keywords:'audit timeline history changes author attachment requester changed versions',paragraphs:[
    'The Activity tab brings together saved ticket changes, comments, and comment attachments in date order. The History control shows the saved ticket versions returned by SharePoint.',
    'Requester changes include the previous and new details when version history contains those fields. Older records may have less detail.',
    'Use comments to explain decisions and work completed. A field change alone may not tell the next agent why it was made.'
  ],related:['edit','comments']},
  {id:'archive',section:'Working With Tickets',title:'Find Archived Tickets',summary:'Look up requests that are no longer in the main working list.',keywords:'archives archive deleted restore bulk permanently delete retention',paragraphs:[
    'Use the Archive view on desktop, or Archives in the mobile ticket menu, to find archived tickets you are allowed to access.',
    'Archiving is different from resolving or closing a ticket. It removes the ticket from the normal working view without meaning that the record has been permanently deleted.',
    'Permanent bulk deletion in the archive requires a Super Admin. Ask one when records need to be permanently removed.'
  ],related:['find','status']},
  {id:'priority',section:'Tracking Work',title:'Choose a Priority',summary:'Use urgency and impact to choose the right level.',keywords:'critical high medium low urgent severity importance colour teal amber red',paragraphs:[
    'Priority helps the team decide what needs attention first. Consider both how urgently help is needed and how many people or services are affected.',
    'Use your organisation’s guidance for Low, Medium, High, and Critical. A Critical request should represent a serious interruption, not simply a preference to receive a faster reply.',
    'You can choose priority when creating a ticket. Later changes depend on your role; agents do not normally have the priority control in the edit form.'
  ],related:['sla','create']},
  {id:'sla',section:'Tracking Work',title:'Understand SLA Targets',summary:'How response time, resolution time, and at-risk indicators work.',keywords:'service level agreement clock timer overdue breach business hours pending pause percentage risk time hours minutes',paragraphs:[
    'An SLA is the time target for responding to or resolving a request. Different priorities can have different targets.',
    'DeskPilot calculates elapsed time from ticket timestamps and the saved clock rules. Business-hours mode counts the configured working schedule; otherwise time runs continuously. Pending time is excluded only when that option is enabled and reliable pause history exists.',
    'The at-risk indicator warns before a target is missed. An overdue or breached target has already been missed. Unknown means there is not enough reliable timing information to calculate the result.',
    'Helpdesk Admins manage targets and clock rules in Settings > SLA & Priorities. The Active switch controls whether an SLA target is enabled for that priority.'
  ],note:'Elapsed time continues while the app is closed because it is calculated from dates, not from a browser stopwatch. In the SharePoint app, checks and alerts still depend on the app running or a separate automation.',related:['priority','dashboard']},
  {id:'dashboard',section:'Tracking Work',title:'Read the Dashboard',summary:'Use totals, charts, and filters to understand support work.',keywords:'statistics stats reports monthly trend resolved closed overdue average resolution performance metrics',steps:[
    'Choose the date range. Use department and assignee filters where available; on mobile, additional filters are in the configuration menu.',
    'Review the ticket totals and current status breakdown. The Resolved total includes closed tickets, while the status chart keeps current states separate.',
    'Use the trend and SLA sections to spot changes, overdue work, or missing timing information.',
    'Open a listed ticket to follow up on it. Clear the filters before comparing the overall workload.'
  ],note:'Dashboard totals are limited to the tickets your account can access and the filters currently selected.',related:['status','sla','find']},
  {id:'knowledge-read',section:'Knowledge Base',title:'Find an Article',summary:'Search reusable instructions and solutions.',keywords:'knowledge base faq question answer article search category inactive published guide instructions',steps:[
    'Open Knowledge Base and choose a category or All Categories.',
    'Search using the service name, a symptom, or words you remember from the issue.',
    'Read the article content and follow the instructions that apply to your situation. On mobile the table can scroll sideways to show more columns.'
  ],note:'Published articles can also appear in Quick Help. Agents may additionally see unpublished articles they can edit; these are not published guidance for other users.',related:['quick-help','knowledge-create','knowledge-edit']},
  {id:'knowledge-create',section:'Knowledge Base',title:'Create a Knowledge Base Article',summary:'Add a reusable guide without starting from a ticket comment.',keywords:'new article add create publish title content keywords classification draft solution',steps:[
    'Open Knowledge Base and choose New Article. Agents and Helpdesk Admins can create articles directly.',
    'Write a clear title and enter the instructions in Content. The title grows onto another line when needed.',
    'Choose a category and subcategory, then add useful search keywords.',
    'Select Publish This Article when it is ready for others to use, or leave it unpublished while preparing it.',
    'Select Save Article. A saved draft is not the same as a published article.'
  ],related:['knowledge-edit','knowledge-read']},
  {id:'knowledge-edit',section:'Knowledge Base',title:'Edit an Article or Allow Agent Editing',summary:'Understand article ownership and shared editing.',keywords:'permission author creator publisher edit locked access allow agents checkbox administrator',paragraphs:[
    'Agents can edit articles they created, including their own drafts. They can also edit articles they published. Helpdesk Admins can create and edit any article.',
    'To edit an article, select its title when it is shown as an editable link, make the changes, and save. An agent cannot edit another person’s article unless permitted.',
    'A Helpdesk Admin can open an article and select Allow Agents to Edit This Article. After saving, agents with the required workspace access can edit that article. Clearing the option removes that shared editing permission; its creator and publisher retain their own access.',
    'If this option is unavailable because the workspace fields have not been configured, ask a Super Admin to run Initialize Workspace. Older articles without a recorded publisher use their creator as the ownership fallback.'
  ],related:['knowledge-create','roles']},
  {id:'teams',section:'For Helpdesk Admins',title:'Set Up Support Teams and Assignment',summary:'Group agents and connect the right team to a category.',keywords:'members team lead users rotation available round robin auto assignment categories routing',steps:[
    'Open Settings > Support Teams and choose Create Teams. Enter one team name per line.',
    'Open a team, add members, and choose the team lead. The mobile list shows each team’s name and member count; use its chevron to open it.',
    'Set the team’s categories and check which members are available for assignment.',
    'Open Settings > Assignment to enable automatic assignment and choose Round Robin or Team Lead.'
  ],note:'Keep team membership and availability current. A category must match a configured team before its routing rule can help.',related:['assign','users']},
  {id:'users',section:'For Helpdesk Admins',title:'Add Users and Manage Roles',summary:'Give colleagues access and send their invitation when ready.',keywords:'users roles add person invite invitation email active inactive disabled permissions reload restore defaults',steps:[
    'Open Settings > Users & Roles and choose Add Users.',
    'Search your organisation, select the people, and choose Agent or Helpdesk Admin before adding them.',
    'If automatic invitation is off, use Send Invite on the user’s row when you are ready.',
    'Use Roles & Permissions to review the role rules. Edit Permissions changes the draft, Reload fetches the saved rules, and Restore Defaults returns the selected role to its standard settings. Confirm changes when prompted.'
  ],note:'Active and inactive here refer to DeskPilot access, not whether a Microsoft 365 account is enabled. SharePoint site and list access still apply. Ask a Super Admin if the underlying permissions prevent an action.',related:['roles','notifications','missing']},
  {id:'notifications',section:'For Helpdesk Admins',title:'Manage Emails and Notifications',summary:'Choose which events send messages and edit their wording.',keywords:'email templates notification rules sender save discard placeholder variable invite invitation enabled on off mailbox alerts bell',steps:[
    'Open Settings > Email & Notifications. Notification Rules controls ticket events and their Email and In-App switches.',
    'Select an event’s template name to edit its subject, message, and recipients.',
    'Use Insert Placeholder to search for a value such as Ticket Title or Requester Name. The badge is replaced with the actual value when the email is prepared; its small remove button removes it from the template.',
    'Select Save to keep changes, or Discard to return to the saved version. Use Send Test to Me to check a template where available.',
    'Use the invitation settings to choose whether adding a user sends an invitation automatically. Invitation email options remain visible below that setting.',
    'Check History when you need to investigate an email. Accepted means the mail service accepted the request; it does not prove delivery to the recipient.'
  ],note:'A Helpdesk Admin cannot change the DeskPilot Page URL in email settings; that requires a Super Admin. Sender permissions and valid addresses are also needed for email to work.',related:['resolve','users','updates']},
  {id:'classifications',section:'For Helpdesk Admins',title:'Maintain Categories and Issue Types',summary:'Keep ticket and article classifications useful and consistent.',keywords:'settings taxonomy classification category subcategory issue type active inactive new edit',paragraphs:[
    'Use the relevant Settings section to add and maintain categories, subcategories, and issue types. Choose meaningful names that people will recognise.',
    'Subcategories belong to a category. Check the parent when adding or changing one, and update support-team category mappings when routing needs to change.',
    'On mobile, use a row’s chevron to show more fields and available actions. Ticket List Schema is a separate technical setting that requires a Super Admin.'
  ],related:['teams','create']},
  {id:'updates',section:'Common Questions',title:'When Do New Tickets and Updates Appear?',summary:'Background checking updates the list without reloading the whole page.',keywords:'refresh slow loading live real time whatsapp new ticket toast popup browser closed email forms autoassign',paragraphs:[
    'While DeskPilot is open, background checking can bring new tickets into the list and show a brief new-ticket alert. This is a data update, not a full browser refresh.',
    'Use Refresh when you need to check immediately. Avoid reloading the entire browser while writing an unsaved form or comment.',
    'An email or Forms ticket appearing in the list does not mean the browser ran automatic assignment or sent a DeskPilot email for it. Those external creation actions need their own automation.',
    'Closing the app stops its browser-based checking. DeskPilot is not a server running in the background when nobody has it open.'
  ],related:['assign','find','notifications']},
  {id:'missing',section:'Common Questions',title:'Why Is a Ticket, Button, or User Missing?',summary:'Check views, filters, role access, and permissions first.',keywords:'cannot see missing access denied permission disabled grey no users zero empty loading retry error',steps:[
    'Check your selected view, search text, status filter, and date range. Try clearing them and selecting Refresh.',
    'Confirm you are in the correct workspace and that the ticket is not archived.',
    'Remember that your role limits the tickets and actions you can see. A disabled field may be intentionally protected, such as another person’s ticket description.',
    'Ask a Helpdesk Admin to check your DeskPilot role. If the problem is site access, workspace configuration, or protected fields, ask a Super Admin to check it.',
    'When reporting a problem, include the ticket number, the action you tried, and the exact error text. Never include your password.'
  ],related:['roles','find','archive']},
  {id:'guide-overview',featureOverview:true,section:'Getting Started',title:'User Guide Overview',summary:'Start with the screens and roles, then learn the tasks you need.',keywords:'overview introduction learn basics beginner where start user guide',paragraphs:[
    'DeskPilot is a workspace for recording support requests, following their progress, and sharing guidance. This part of the guide explains the application before you start working with tickets.',
    'Begin with Welcome to DeskPilot, then read Get to Know the Interface to understand the screens and controls. Understand Your Role explains which actions are available to Agents and Helpdesk Admins.'
  ],sections:[{id:'next',title:'Where to Start',paragraphs:[
    'If you are new to DeskPilot, read the topics below in order. If you already know the application, use a feature group in the sidebar or search for the task you need.',
    'Getting Started at the top of the sidebar returns to the guide home page. Each feature group begins with an overview, followed by instructions for individual tasks.'
  ]}]},
  {id:'tickets-overview',featureOverview:true,section:'Working With Tickets',title:'Tickets Overview',summary:'Understand a ticket and how it moves through the support process.',keywords:'overview tickets workflow request lifecycle create assign comment resolve close feature',paragraphs:[
    'A ticket is the record of a support request. It brings together the problem, the requester, the person handling it, the conversation, and the outcome. Use tickets for work that needs to be followed through to completion.',
    'The ticket list helps you find requests. Opening a ticket shows its description, details, comments, files, and recorded activity. What you can see or change depends on your role and your relationship to that ticket.'
  ],sections:[{id:'flow',title:'How a Request Moves Through DeskPilot',paragraphs:[
    'Create the ticket with enough information for someone to act. Choose an assignee, or let a configured assignment rule route it. An assigned ticket starts In Progress.',
    'Keep updates and questions in Comments. Use Pending when work is waiting and explain why. Resolve records the result when the work is complete; a Helpdesk Admin can then close the ticket.'
  ]},{id:'choose',title:'Choose the Task You Need',paragraphs:[
    'Start with Create a Ticket if you are reporting a new issue. Use Find, Filter, and Sort Tickets to locate existing work. The remaining topics explain assignment, edits, conversation, files, and completion.'
  ]}]},
  {id:'tracking-overview',featureOverview:true,section:'Tracking Work',title:'Tracking Work Overview',summary:'Understand priority, time targets, and the dashboard before reading the figures.',keywords:'overview reporting tracking performance priority sla dashboard charts overdue',paragraphs:[
    'Tracking work helps the support team decide what needs attention and see whether requests are being handled within the agreed time. Priority, SLA targets, and dashboard figures each answer a different question.',
    'Priority describes urgency and impact. An SLA describes the target time for a response or resolution. The dashboard brings together the tickets you can access into totals and charts.'
  ],sections:[{id:'interpret',title:'Read the Figures in Context',paragraphs:[
    'Check the date range and other filters before comparing totals. Resolved totals include closed tickets, while the current-status chart keeps those statuses separate.',
    'An at-risk indicator means a target is approaching. A breach means it has been missed. Unknown timing means there is not enough reliable information for the calculation; it does not mean the ticket met its target.'
  ]}]},
  {id:'knowledge-overview',featureOverview:true,section:'Knowledge Base',title:'Knowledge Base Overview',summary:'Find useful guidance and turn repeat solutions into reusable articles.',keywords:'overview knowledge base articles guides faq read create publish edit author',paragraphs:[
    'The Knowledge Base is a collection of instructions and solutions that people can reuse. Use it to find help before creating a request, or to record a solution that will help with future requests.',
    'An article has a title, content, classification, and publication status. Search and category tabs help people find the right guidance. Published articles can also appear in Quick Help.'
  ],sections:[{id:'publishing',title:'Writing and Publishing Are Different',paragraphs:[
    'Save an unpublished article while it is being prepared. Publish This Article makes it available as published guidance. Agents can create articles directly and edit their own; Helpdesk Admins can create and edit any article.',
    'A Helpdesk Admin can also allow agents to edit a particular article. Check the editing topic below for ownership and shared-editing rules.'
  ]}]},
  {id:'administration-overview',featureOverview:true,section:'For Helpdesk Admins',title:'Helpdesk Settings Overview',summary:'Understand how people, teams, routing, and notifications fit together.',keywords:'overview administration settings helpdesk admin people teams users roles assignment notifications categories',paragraphs:[
    'Helpdesk settings control how the support workspace operates day to day. Users & Roles determines DeskPilot access, Support Teams groups the people handling requests, and Assignment connects ticket categories to the appropriate team.',
    'Categories and issue types organise requests. SLA & Priorities defines the time targets. Email & Notifications controls which ticket events send messages and what those messages contain.'
  ],sections:[{id:'sequence',title:'A Practical Setup Order',paragraphs:[
    'Start by checking users and roles. Set up categories, create the support teams, add their members, and check who is available. Then review the assignment method and email notification settings.',
    'Review the saved settings and test a normal request before relying on a changed workflow. DeskPilot role settings do not replace the underlying SharePoint site and list permissions.'
  ]}],note:'Workspace connections, Ticket List Schema, and certain protected settings require a Super Admin. This guide focuses on everyday helpdesk management.'},
  {id:'troubleshooting-overview',featureOverview:true,section:'Common Questions',title:'Troubleshooting Overview',summary:'Identify whether a problem is a filter, a permission, an update delay, or a failed action.',keywords:'overview troubleshoot problem missing error access refresh loading issue help',paragraphs:[
    'Start with what you can see on the screen. A missing ticket may be outside the current filters or your permitted view. A disabled field may be protected for your role. A spinner means an action is still loading.',
    'Read the full message after an action. Some warnings mean the ticket was saved but a later action, such as uploading files or sending a notification, could not finish.'
  ],sections:[{id:'check',title:'Before You Retry',paragraphs:[
    'Check the workspace, selected view, search text, date range, and status filters. Use Refresh to check for current data. Avoid reloading the browser while a form has unsaved work.',
    'When asking for help, include the ticket number, the action you tried, and the exact error. If a ticket already exists, use the available retry action rather than creating a duplicate.'
  ]}]}

];
export function searchDocumentation(query:string):IDocumentationTopic[] {
  const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return documentationTopics.filter(topic=>{
    const text=[topic.title,topic.section,topic.summary,topic.keywords,...(topic.paragraphs || []),...(topic.steps || []),...(topic.sections || []).flatMap(section=>[section.title,...section.paragraphs]),topic.note || ''].join(' ').toLowerCase();
    return words.every(word=>text.includes(word));
  }).sort((a,b)=>{
    const score=(topic:IDocumentationTopic):number=>words.reduce((total,word)=>total+(topic.title.toLowerCase().includes(word)?3:0)+(topic.keywords.includes(word)?1:0),0);
    return score(b)-score(a);
  });
}
