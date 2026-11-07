-- Run once using a deployment identity. The runtime identity needs SELECT/INSERT/UPDATE/DELETE,
-- not schema-alter permissions. Every key includes WorkspaceId to isolate workspaces.
IF SCHEMA_ID('deskpilot') IS NULL EXEC('CREATE SCHEMA deskpilot');
IF OBJECT_ID('deskpilot.Records') IS NULL
BEGIN
 CREATE TABLE deskpilot.Records (
  WorkspaceId nvarchar(64) NOT NULL,
  Kind nvarchar(32) NOT NULL,
  Id bigint IDENTITY(1,1) NOT NULL,
  ParentId bigint NOT NULL DEFAULT 0,
  OwnerId nvarchar(64) NOT NULL DEFAULT '',
  Document nvarchar(max) NOT NULL CHECK(ISJSON(Document)=1),
  Version rowversion NOT NULL,
  CONSTRAINT PK_DeskPilotRecords PRIMARY KEY(WorkspaceId,Kind,Id),
  RequesterEmail AS LOWER(CONVERT(nvarchar(320),JSON_VALUE(Document,'$.Requester.Email'))) PERSISTED,
  CreatorEmail AS LOWER(CONVERT(nvarchar(320),JSON_VALUE(Document,'$.CreatedBy.Email'))) PERSISTED,
  AssignedEmail AS LOWER(CONVERT(nvarchar(320),JSON_VALUE(Document,'$.AssignedTo.Email'))) PERSISTED,
  Department AS CONVERT(nvarchar(255),JSON_VALUE(Document,'$.Department')) PERSISTED
 );
 CREATE INDEX IX_DeskPilotRecords_Parent ON deskpilot.Records(WorkspaceId,Kind,ParentId,Id);
 CREATE INDEX IX_DeskPilotRecords_Requester ON deskpilot.Records(WorkspaceId,Kind,RequesterEmail,Id);
 CREATE INDEX IX_DeskPilotRecords_Assignee ON deskpilot.Records(WorkspaceId,Kind,AssignedEmail,Id);
 CREATE INDEX IX_DeskPilotRecords_Creator ON deskpilot.Records(WorkspaceId,Kind,CreatorEmail,Id);
 CREATE INDEX IX_DeskPilotRecords_Department ON deskpilot.Records(WorkspaceId,Kind,Department,Id);
 CREATE UNIQUE INDEX IX_DeskPilotViews ON deskpilot.Records(WorkspaceId,ParentId,OwnerId) WHERE Kind='view';
 CREATE UNIQUE INDEX IX_DeskPilotRotation ON deskpilot.Records(WorkspaceId,ParentId) WHERE Kind='rotation';
END;
