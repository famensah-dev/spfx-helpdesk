// Hierarchy from the DeskPilot classification requirements.
export const categorySubcategories: Record<string, string[]> = {
  "Microsoft 365": [
    "Outlook",
    "Microsoft Teams",
    "SharePoint / Microsoft Lists",
    "OneDrive",
    "Word",
    "Excel",
    "PowerPoint",
    "Microsoft Forms",
    "Power Automate",
    "Other Microsoft 365 Services"
  ],
  "Clinical Systems": [
    "HealthPro",
    "PACS / Sectra",
    "Laboratory Information System",
    "Medical Device Integration",
    "Other Clinical Systems"
  ],
  "Hardware & Devices": [
    "Desktop Computer",
    "Laptop",
    "Printer",
    "Scanner",
    "Monitor",
    "Keyboard / Mouse",
    "UPS / Power Backup",
    "Other Peripherals"
  ],
  "Network & Connectivity": [
    "Wi-Fi",
    "Wired Network (LAN)",
    "Internet",
    "VPN / Remote Access",
    "Network Cabling / Ports",
    "Network Equipment"
  ],
  "Software & Applications": [
    "Internally Developed Applications",
    "Third-Party Applications",
    "Operating System",
    "Software Licensing",
    "Other Software"
  ],
  "Cybersecurity": [
    "Email Security",
    "Account Security",
    "Endpoint / Device Security",
    "Data Security",
    "Network Security"
  ],
  "IT Services & Setup": [
    "Workstation Setup",
    "Equipment Installation",
    "Equipment Request",
    "Device Configuration",
    "Equipment Relocation",
    "Meeting / Presentation Support"
  ],
  "Data & Reporting": [
    "Reports",
    "Dashboards",
    "Data Extraction",
    "Data Quality",
    "Data Integration"
  ],
  "Other": [
    "General IT Support",
    "Unclassified Issue"
  ]
};

const access = ['Account Access', 'Password Reset', 'Account Locked', 'Login Failure', 'New Account Creation', 'Account Deactivation', 'Access Permission Change', 'Multi-Factor Authentication Issue'];
const application = ['System Unavailable', 'Slow Performance', 'Application Error', 'Feature Not Working', 'Installation', 'Configuration / Setup', 'Software Update', 'License Activation / Renewal'];
const hardware = ['Malfunction / Fault', 'Not Powering On', 'Equipment Replacement', 'Equipment Request', 'Installation', 'Configuration / Setup'];
const network = ['Connectivity Failure', 'Intermittent Connection', 'Slow Internet / Network', 'Configuration / Setup'];
const data = ['Data Missing / Incorrect', 'Data Correction', 'Data Extraction', 'Report Generation', 'Dashboard Issue', 'System Integration / Synchronization'];
const security = ['Suspicious Email / Phishing', 'Malware / Virus', 'Unauthorized Access', 'Access Permission Change', 'Multi-Factor Authentication Issue'];
const support = ['Technical Assistance', 'User Guidance / Training', 'General Enquiry', 'Other'];
// Maintain relevant request options here; the form intersects these with actual list choices.
export const subcategoryIssueTypes: Record<string, string[]> = {};
Object.keys(categorySubcategories).forEach(category => categorySubcategories[category].forEach(subcategory => {
  const base = category === 'Hardware & Devices' ? hardware : category === 'Network & Connectivity' ? network : category === 'Cybersecurity' ? security : category === 'Data & Reporting' ? data : category === 'IT Services & Setup' ? ['Installation', 'Configuration / Setup', 'Equipment Request', 'Equipment Replacement'] : category === 'Other' ? [] : [...access, ...application, ...data];
  subcategoryIssueTypes[subcategory] = [...base, ...support];
}));
subcategoryIssueTypes.Outlook = [...access, 'Email Not Sending', 'Email Not Receiving', 'Email Configuration', 'Suspicious Email / Phishing', ...application, ...support];
subcategoryIssueTypes.Printer = [...hardware, 'Printing Failure', 'Paper Jam', 'Toner / Cartridge Replacement', 'Connectivity Failure', ...support];
subcategoryIssueTypes.Scanner = [...hardware, 'Scanning Failure', 'Connectivity Failure', ...support];
subcategoryIssueTypes['Email Security'] = ['Suspicious Email / Phishing', 'Unauthorized Access', 'Email Configuration', ...support];
subcategoryIssueTypes['Account Security'] = [...access, 'Unauthorized Access', ...support];
export function classificationChoices(key: string, choices: string[], category: string, subcategory: string): string[] {
  const allowed = key === 'subcategory' ? categorySubcategories[category] : key === 'issueType' ? subcategoryIssueTypes[subcategory] : undefined;
  if ((key === 'subcategory' && !category) || (key === 'issueType' && !subcategory)) return [];
  return allowed ? choices.filter(value => allowed.includes(value)) : choices;
}
