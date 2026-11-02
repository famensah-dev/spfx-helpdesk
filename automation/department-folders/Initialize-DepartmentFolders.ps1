[CmdletBinding(SupportsShouldProcess, ConfirmImpact='High')]
param(
  [Parameter(Mandatory)][string]$SiteUrl,
  [Parameter(Mandatory)][string]$RosterCsv,
  [string]$TicketsList='Tickets',
  [string]$CommentsList='TicketComments',
  [string]$DepartmentKey='ugmc-it',
  [string]$DepartmentName='UGMC IT',
  [string]$OutputPath='./department-folder-policy.json',
  [switch]$Apply,
  [switch]$Activate
)
$ErrorActionPreference='Stop'
if($DepartmentKey -notmatch '^[-a-z0-9]{1,64}$'){throw 'Invalid department key.'}
if($Activate -and -not $Apply){throw 'Activation requires Apply.'}
$rows=@(Import-Csv -LiteralPath $RosterCsv)
if(-not $rows.Count){throw 'Provide the approved department roster.'}
foreach($row in $rows){if(-not $row.Login -or $row.Role -notin @('Requester','Agent','Admin')){throw 'Each roster row needs Login and Role (Requester, Agent, Admin).'}}
if(@($rows.Login | Select-Object -Unique).Count -ne $rows.Count){throw 'Duplicate roster login.'}
Write-Output "Plan for $SiteUrl : isolate $TicketsList and $CommentsList; prepare $DepartmentName department and $($rows.Count) requester folders in each list."
Write-Output 'Existing ticket/comment records will NOT be migrated. Nonempty lists are refused. No tenant group is granted blanket ticket access.'
if(-not $Apply){Write-Output 'Preview only. Review roster and script, connect with Connect-PnPOnline as a site owner, then rerun with -Apply.';return}
if(-not (Get-Command Get-PnPContext -ErrorAction SilentlyContinue)){throw 'PnP.PowerShell is required. Connect separately as a site owner first.'}
$web=Get-PnPWeb -Includes AssociatedOwnerGroup,Url
if($web.Url.TrimEnd('/') -ne $SiteUrl.TrimEnd('/')){throw 'The current PnP connection is for a different site.'}
$ctx=Get-PnPContext
$lists=@(Get-PnPList -Identity $TicketsList -Includes RootFolder;Get-PnPList -Identity $CommentsList -Includes RootFolder)
foreach($list in $lists){
  $query=[Microsoft.SharePoint.Client.CamlQuery]::new()
  $query.ViewXml="<View Scope='RecursiveAll'><Query><Where><Eq><FieldRef Name='FSObjType'/><Value Type='Integer'>0</Value></Eq></Where></Query><RowLimit>1</RowLimit></View>"
  $items=$list.GetItems($query);$ctx.Load($items);$ctx.ExecuteQuery()
  if($items.Count){throw "$($list.Title) contains records. Use a reviewed migration into staging lists; this script will not rewrite existing data or ACLs."}
}
if(-not $PSCmdlet.ShouldProcess($SiteUrl,'Isolate both list roots and provision department/requester folder permissions')){return}
$owners=$web.AssociatedOwnerGroup
$full=Get-PnPRoleDefinition | Where-Object RoleTypeKind -eq 'Administrator' | Select-Object -First 1
if(-not $full){throw 'Full Control permission level not found.'}
$work=Get-PnPRoleDefinition | Where-Object Name -eq 'DeskPilot Work Items' | Select-Object -First 1
if(-not $work){
  $contribute=Get-PnPRoleDefinition | Where-Object RoleTypeKind -eq 'Contributor' | Select-Object -First 1
  if(-not $contribute){throw 'Contribute permission level not found.'}
  $permissions=[Microsoft.SharePoint.Client.BasePermissions]::new()
  foreach($kind in [Enum]::GetValues([Microsoft.SharePoint.Client.PermissionKind])){if($contribute.BasePermissions.Has($kind)){$permissions.Set($kind)}}
  $permissions.Clear([Microsoft.SharePoint.Client.PermissionKind]::DeleteListItems)
  $permissions.Clear([Microsoft.SharePoint.Client.PermissionKind]::DeleteVersions)
  $info=[Microsoft.SharePoint.Client.RoleDefinitionCreationInformation]::new();$info.Name='DeskPilot Work Items';$info.Description='Work on records within an authorized folder without deleting records or versions.';$info.BasePermissions=$permissions
  $work=$web.RoleDefinitions.Add($info);$ctx.Load($work);$ctx.ExecuteQuery()
}
function Grant($Object,$Principal,$Role){
  $ctx.Load($Object.RoleAssignments);$ctx.ExecuteQuery()
  $existing=$Object.RoleAssignments | Where-Object PrincipalId -eq $Principal.Id | Select-Object -First 1
  if($existing){$ctx.Load($existing.RoleDefinitionBindings);$ctx.ExecuteQuery();$existing.RoleDefinitionBindings.RemoveAll();$existing.RoleDefinitionBindings.Add($Role);$existing.Update()}
  else {$bindings=[Microsoft.SharePoint.Client.RoleDefinitionBindingCollection]::new($ctx);$bindings.Add($Role);$null=$Object.RoleAssignments.Add($Principal,$bindings)}
  $ctx.ExecuteQuery()
}
function Protect($Object,$Grants){
  $null=Get-PnPProperty -ClientObject $Object -Property HasUniqueRoleAssignments
  if(-not $Object.HasUniqueRoleAssignments){$Object.BreakRoleInheritance($false,$false);$ctx.ExecuteQuery()}
  Grant $Object $owners $full
  $ctx.Load($Object.RoleAssignments);$ctx.ExecuteQuery()
  $allowed=@($owners.Id)+@($Grants | ForEach-Object {$_.Principal.Id})
  foreach($assignment in @($Object.RoleAssignments)){if($assignment.PrincipalId -notin $allowed){$assignment.DeleteObject()}}
  $ctx.ExecuteQuery()
  foreach($entry in $Grants){Grant $Object $entry.Principal $entry.Role}
}
function Ensure-Folder($List,[string]$Parent,[string]$Leaf){
  $url=$Parent.TrimEnd('/')+'/'+$Leaf
  try {$folder=Get-PnPFolder -Url $url -Includes ListItemAllFields -ErrorAction Stop;return $folder.ListItemAllFields}
  catch {
    # Only a missing-folder error is safe to treat as creation; check the parent before creating.
    $null=Get-PnPFolder -Url $Parent -ErrorAction Stop
    $info=[Microsoft.SharePoint.Client.ListItemCreationInformation]::new();$info.UnderlyingObjectType=[Microsoft.SharePoint.Client.FileSystemObjectType]::Folder;$info.FolderUrl=$Parent;$info.LeafName=$Leaf
    $item=$List.AddItem($info);$item['Title']=$Leaf;$item.Update();$ctx.Load($item);$ctx.ExecuteQuery();return $item
  }
}
$groups=@{}
foreach($role in @('Agent','Admin')){
  $name="DeskPilot $DepartmentName $role"
  $group=Get-PnPGroup | Where-Object Title -eq $name | Select-Object -First 1
  if(-not $group){$group=New-PnPGroup -Title $name -Owner $owners.Title}
  $groups[$role]=$group
}
$people=@{}
foreach($row in $rows){
  $user=New-PnPUser -LoginName $row.Login;$people[$row.Login]=$user
  $roleGroup=switch($row.Role){'Agent' {'DeskPilot Agents'} 'Admin' {'DeskPilot Helpdesk Administrator'} default {'DeskPilot Requesters'}}
  $null=Add-PnPGroupMember -Identity $roleGroup -LoginName $row.Login
  if($row.Role -ne 'Requester'){$null=Add-PnPGroupMember -Identity $groups[$row.Role] -LoginName $row.Login}
}
$departmentGrants=@(@{Principal=$groups.Agent;Role=$work},@{Principal=$groups.Admin;Role=$work})
foreach($list in $lists){
  $list.EnableFolderCreation=$true;$list.Update();$ctx.ExecuteQuery()
  Protect $list @()
  $root=$list.RootFolder.ServerRelativeUrl
  $departments=Ensure-Folder $list $root 'Departments';Protect $departments @()
  $department=Ensure-Folder $list ($root+'/Departments') $DepartmentKey;Protect $department $departmentGrants
  $requesters=Ensure-Folder $list ($root+'/Departments/'+$DepartmentKey) 'Requesters'
  Protect $requesters $departmentGrants
  foreach($row in $rows){$user=$people[$row.Login];$folder=Ensure-Folder $list ($root+'/Departments/'+$DepartmentKey+'/Requesters') ([string]$user.Id);Protect $folder ($departmentGrants+@(@{Principal=$user;Role=$work}))}
}
$policy=@{departments=@(@{key=$DepartmentKey;name=$DepartmentName});ticketRoot=$lists[0].RootFolder.ServerRelativeUrl;commentRoot=$lists[1].RootFolder.ServerRelativeUrl}
$policy | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding utf8
if($Activate){
  $query="<View><Query><Where><Eq><FieldRef Name='Title'/><Value Type='Text'>Configuration</Value></Eq></Where></Query></View>"
  $items=@(Get-PnPListItem -List 'DeskPilot Access' -Query $query)
  if($items.Count -ne 1){throw 'Initialize DeskPilot access first. The staged folders remain protected but routing was not activated.'}
  $rules=$items[0]['Rules'] | ConvertFrom-Json
  $rules.workspace | Add-Member -NotePropertyName departmentFolders -NotePropertyValue $policy -Force
  if(-not $rules.workspace.resourceIds){$rules.workspace | Add-Member -NotePropertyName resourceIds -NotePropertyValue ([pscustomobject]@{}) -Force}
  $rules.workspace.resourceIds | Add-Member -NotePropertyName tickets -NotePropertyValue ([string]$lists[0].Id) -Force
  $rules.workspace.resourceIds | Add-Member -NotePropertyName comments -NotePropertyValue ([string]$lists[1].Id) -Force
  $rules.workspace.listId=[string]$lists[0].Id;$rules.workspace.listName=$lists[0].Title
  $json=$rules | ConvertTo-Json -Depth 30 -Compress
  if($json.Length -gt 60000){throw 'The access configuration is too large. Routing was not activated.'}
  $null=Set-PnPListItem -List 'DeskPilot Access' -Identity $items[0].Id -Values @{Rules=$json}
  Write-Output 'Routing activated. Open DeskPilot as a site owner to refresh access projections, then validate with separate requester/agent test accounts.'
}
Write-Output "Folder policy written to $OutputPath. Existing ticket data was not moved. Review direct access and test permissions before production cutover."
