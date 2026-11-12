# Classification seeders

Seed Ticket Categories before Ticket Subcategories. The subcategory workbook contains Title, Category, Active, and SortOrder. Category contains the parent category name, not a SharePoint item ID.

The application requires Category on the subcategories list to be a single-value lookup to the categories list. When importing the workbook, resolve each Category name to the actual parent item in that list. Importing into a plain text Category column does not create the required relationship. Do not assume category IDs are identical between sites.

For missing subcategories, check:

1. Both the parent category and subcategory have Active set to Yes.
2. Category is a lookup to the configured categories list, and every active subcategory has a parent selected.
3. Choose the category first in the ticket form. Its subcategory field is filtered to that parent.
4. Check the form error if column types or lookup targets are invalid. Existing data is preserved.

The ticket and Knowledge Base loaders explicitly request the Category lookup ID from Graph. SharePoint access to all three classification lists is required.
