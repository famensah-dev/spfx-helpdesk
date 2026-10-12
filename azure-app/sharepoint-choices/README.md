# Classification Choice column correction

The user authorized correction of Issue Category, Issue Subcategory, and Issue Type to Choice columns. The workspace has no authenticated SharePoint management connection, so no remote column changes have been executed.

The adjacent text files contain the exact options from the user's classification requirements, one choice per line. They are ready to paste into SharePoint's choice editor. Configure each column for a single selection, dropdown display, no fill-in choices, and no default selection.

| Column | Current internal name | Choices file |
| --- | --- | --- |
| Issue Category | field_4 | issue-categories.txt |
| Issue Subcategory | field_5 | issue-subcategories.txt |
| Issue Type (the Issue / Request selection) | field_6 | issue-requests.txt |

In the Issue tracker list, open Settings → List settings → Columns → the relevant column. If SharePoint offers conversion to Choice, review existing values before saving. If conversion is unavailable, retain the old column and create a replacement Choice column; do not delete existing data. Replacement columns will have different internal names and need to be verified again through Graph.

Number values in Subcategory or Issue Type must not be assumed to correspond to option positions. If populated, their meaning must be established before migration.

After changes, retrieve the list's Graph `/columns` response again. That response—not the old schema snapshot—will determine DeskPilot's field mapping. These files do not implement cascading dropdowns; that remains part of the application migration.
