# Mission Control Setup

## Database Migration Required

To enable attachments functionality, you need to add the `attachments` column to the `mission_control_tasks` table.

### Option 1: Supabase SQL Editor (Recommended)

1. Go to https://zzbzzpjqmbferplrwesn.supabase.co/project/_/sql
2. Run the following SQL:

```sql
ALTER TABLE mission_control_tasks 
ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;
```

### Option 2: Via psql (if you have direct database access)

```bash
psql <your-database-connection-string> -c "ALTER TABLE mission_control_tasks ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;"
```

## Features Included

✅ **Kanban Board UI**
- 4 columns: Inbox → Backlog → In Progress → Done
- Task cards show: title, priority badge, category badge, description preview
- Dark theme matching existing app design
- Full-width responsive layout

✅ **Drag and Drop**
- Uses @hello-pangea/dnd library
- Drag cards between columns to change status
- Drag within columns to reorder tasks
- Automatically updates `status` and `sort_order` fields
- Persists changes to Supabase immediately

✅ **Task Ordering**
- Cards sorted by `sort_order` within each column (ASC)
- Smart sort_order calculation when cards are moved
- Uses fractional ordering to avoid large re-sorts

✅ **Attachments**
- Upload multiple files via file picker
- Stores files in Supabase Storage bucket: `mission-control-attachments`
- Attachment metadata stored in `attachments` JSONB column
- Shows file previews (for images) and download links
- Delete attachments individually
- **Requires the attachments column to be added (see above)**

✅ **Task Detail Modal**
- Click any card to open detail/edit modal
- Edit all task fields: title, description, priority, category, estimate
- Add/view/remove attachments
- Quick "Mark as Done" button
- Delete task option
- Links to PR and evidence URLs

✅ **Create Task**
- "+" button in each column header
- Creates task directly in that status
- Simple form with all task fields
- Automatically calculates sort_order

## Navigation

- Desktop: "Mission Control" link in top navbar
- Mobile: "Mission Control" in hamburger menu
- Route: `/mission-control`
- Icon: ClipboardList (lucide-react)

## Storage Bucket

The `mission-control-attachments` storage bucket has been created with public access.

Files are organized by user: `{user_id}/{timestamp}-{random}.{ext}`

## Deployed

✅ Deployed to UAT: https://uat.opsyncpro.io/mission-control

## Next Steps

1. Add the `attachments` column using the SQL above
2. Test drag & drop functionality
3. Upload some test attachments
4. Verify mobile responsiveness
