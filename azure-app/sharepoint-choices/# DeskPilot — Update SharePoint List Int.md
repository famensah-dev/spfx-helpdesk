# DeskPilot — Update SharePoint List Integration and Ticket Classification

I have deleted the previous Microsoft List and created a new list from an Excel import in my personal Microsoft 365 tenant.

Update DeskPilot to work with the new list structure, ticket statuses, and issue classification system.

**Important:** Inspect the existing codebase and retrieve the actual SharePoint column schema through Microsoft Graph before making changes. Do not assume the old List ID, internal column names, or field types are still valid.

## 1. Update the Microsoft Graph Integration

- Replace the previous Tickets List ID with the new one.
- Verify the SharePoint Site ID and tenant configuration.
- Retrieve the new list's columns and identify their actual internal names.
- Update all ticket fetching, creation, editing, assignment, filtering, and reporting operations.
- Ensure Person, Choice, Date/Time, and multiline text fields are handled correctly.
- Verify that the current authentication and Microsoft Graph permissions work with the new list.
- Keep the tenant and list identifiers configurable through environment variables.

Do not modify unrelated application functionality.

## 2. Update Ticket Statuses

Use the following ticket lifecycle:

1. New
2. Assigned
3. In Progress
4. On Hold
5. Resolved
6. Closed

The previous **Pending** status is now **On Hold**, and **Completed** is now **Resolved**.

Support escalation as a separate ticket action, ideally with escalation level, recipient, reason, timestamp, and activity history. If the new list still contains an Escalated status, preserve compatibility until its actual schema and usage have been verified.

Update status badges, filters, dashboards, ticket details, and status transitions accordingly.

## 3. Implement Three-Level Issue Classification

The new classification hierarchy is:

**Issue Category → Issue Subcategory → Issue / Request**

The purpose is to identify which service is affected, which specific component is involved, and the actual problem or request.

### Issue Categories

- Microsoft 365
- Clinical Systems
- Hardware & Devices
- Network & Connectivity
- Software & Applications
- Cybersecurity
- IT Services & Setup
- Data & Reporting
- Other

### Issue Subcategories

**Microsoft 365**
- Outlook
- Microsoft Teams
- SharePoint / Microsoft Lists
- OneDrive
- Word
- Excel
- PowerPoint
- Microsoft Forms
- Power Automate
- Other Microsoft 365 Services

**Clinical Systems**
- HealthPro
- PACS / Sectra
- Laboratory Information System
- Medical Device Integration
- Other Clinical Systems

**Hardware & Devices**
- Desktop Computer
- Laptop
- Printer
- Scanner
- Monitor
- Keyboard / Mouse
- UPS / Power Backup
- Other Peripherals

**Network & Connectivity**
- Wi-Fi
- Wired Network (LAN)
- Internet
- VPN / Remote Access
- Network Cabling / Ports
- Network Equipment

**Software & Applications**
- Internally Developed Applications
- Third-Party Applications
- Operating System
- Software Licensing
- Other Software

**Cybersecurity**
- Email Security
- Account Security
- Endpoint / Device Security
- Data Security
- Network Security

**IT Services & Setup**
- Workstation Setup
- Equipment Installation
- Equipment Request
- Device Configuration
- Equipment Relocation
- Meeting / Presentation Support

**Data & Reporting**
- Reports
- Dashboards
- Data Extraction
- Data Quality
- Data Integration

**Other**
- General IT Support
- Unclassified Issue

### Issue / Request Options

- Account Access
- Password Reset
- Account Locked
- Login Failure
- New Account Creation
- Account Deactivation
- Access Permission Change
- Multi-Factor Authentication Issue
- System Unavailable
- Slow Performance
- Application Error
- Feature Not Working
- Installation
- Configuration / Setup
- Software Update
- License Activation / Renewal
- Malfunction / Fault
- Not Powering On
- Printing Failure
- Scanning Failure
- Paper Jam
- Toner / Cartridge Replacement
- Equipment Replacement
- Equipment Request
- Connectivity Failure
- Intermittent Connection
- Slow Internet / Network
- Email Not Sending
- Email Not Receiving
- Email Configuration
- Suspicious Email / Phishing
- Malware / Virus
- Unauthorized Access
- Data Missing / Incorrect
- Data Correction
- Data Extraction
- Report Generation
- Dashboard Issue
- System Integration / Synchronization
- Technical Assistance
- User Guidance / Training
- General Enquiry
- Other

## 4. Implement Dependent Dropdowns

Update the ticket submission and editing forms so that:

1. Selecting a category displays only subcategories belonging to that category.
2. Selecting a subcategory displays only relevant Issue / Request options.
3. Changing a parent selection clears any incompatible child selections.
4. Existing tickets with legacy or unmatched values remain readable and editable.
5. The selected values are saved to the correct SharePoint fields.

Example:

Category: Clinical Systems  
Subcategory: HealthPro  
Issue / Request: Password Reset

Another example:

Category: Hardware & Devices  
Subcategory: Printer  
Issue / Request: Malfunction / Fault

Define a maintainable mapping of relevant Issue / Request options for each subcategory. Do not assume every issue type is applicable to every system.

## 5. Verify Ticket Columns

Review the new list schema and update the application mappings for these fields where present:

- Title
- Description
- Issue Category
- Issue Subcategory
- Issue / Request
- Status
- Priority
- Assigned To
- Requester / Requested By
- Department / Unit
- Expected Resolution Date
- Viewed / Started At
- Completed / Resolved At
- Closed At
- Resolution Summary
- Attachments
- Escalation-related fields

These are expected business fields, not verified internal SharePoint names. Identify which columns actually exist, which have been renamed, and which are missing. Do not silently create or change SharePoint columns without approval.

## 6. Update Reporting and Dashboard Filters

Ensure administrators can analyze tickets by:

- Issue Category
- Issue Subcategory
- Issue / Request
- Status
- Priority
- Assigned Officer
- Requesting Department
- Date range

Support reporting such as:

- Clinical Systems → HealthPro → Password Reset
- Microsoft 365 → Outlook → Account Access
- Hardware & Devices → Printer → Malfunction / Fault

Make it possible to identify the most frequently reported issues and affected systems.

## 7. Preserve Existing Functionality

Do not break:

- Microsoft Entra ID authentication
- Microsoft Graph integration
- Ticket creation and editing
- Ticket assignment
- Role-based access
- Ticket history and comments
- Notifications and existing workflows
- Dashboard functionality

Before implementing, summarize the differences between the old and new list schemas. After implementation, provide the files changed, required environment variable updates, any SharePoint changes that still need to be made manually, and the results of relevant tests.

Do not assume a successful migration until ticket retrieval, creation, assignment, status updates, and classification saving have been verified.