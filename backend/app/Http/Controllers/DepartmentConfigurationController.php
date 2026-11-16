<?php

namespace App\Http\Controllers;

use App\Services\ArticleHtml;
use App\Services\DepartmentAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DepartmentConfigurationController extends Controller
{
    public function authorizeSettings(Request $request, int $id, string $kind): void
    {
        $access = app(DepartmentAccess::class);
        abort_unless($access->allows($request->user(), $id), 404);
        [$action, $page] = match ($kind) {
            'sla' => ['sla', 'sla'],
            'email' => ['manageEmail', 'email'],
            'teams' => ['manageTeams', 'units'],
            default => abort(404),
        };
        abort_unless($request->user()->isAdmin() && $access->can($request->user(), $id, $action) && $access->canAccessSettings($request->user(), $id, $page), 403);
    }

    public function show(Request $request, int $id, string $kind)
    {
        $this->authorizeSettings($request, $id, $kind);

        return $this->read($request, $id, $kind);
    }

    public function saveEmail(Request $request, int $id)
    {
        $this->authorizeSettings($request, $id, 'email');
        $events = ['created', 'assigned', 'resolved', 'closed', 'invited', 'slaBreached'];
        $input = $request->validate([
            'enabled' => ['required', 'boolean'], 'autoInvite' => ['sometimes', 'boolean'],
            'sender' => ['required', Rule::in(['current', 'shared'])],
            'sharedMailbox' => ['nullable', 'email', 'max:254', 'required_if:sender,shared'],
            'replyTo' => ['nullable', 'email', 'max:254'], 'appUrl' => ['required', 'url:https', 'max:2048'],
            'rules' => ['required', 'array:'.implode(',', $events)],
            'rules.*' => ['required', 'array:email,inApp,subject,body,to,cc,extraTo,extraCc'],
            'rules.*.email' => ['required', 'boolean'], 'rules.*.inApp' => ['required', 'boolean'],
            'rules.*.subject' => ['required', 'string', 'max:500', 'not_regex:/[\r\n]/'],
            'rules.*.body' => ['required', 'string', 'max:100000'],
            'rules.*.to' => ['present', 'array', 'max:5'], 'rules.*.cc' => ['present', 'array', 'max:5'],
            'rules.*.to.*' => [Rule::in(['requester', 'creator', 'assignee', 'team', 'actor'])],
            'rules.*.cc.*' => [Rule::in(['requester', 'creator', 'assignee', 'team', 'actor'])],
            'rules.*.extraTo' => ['present', 'array', 'max:50'], 'rules.*.extraCc' => ['present', 'array', 'max:50'],
            'rules.*.extraTo.*' => ['email', 'max:254'], 'rules.*.extraCc.*' => ['email', 'max:254'],
        ]);
        foreach ($events as $event) {
            abort_unless(isset($input['rules'][$event]), 422, 'All notification templates are required.');
            $input['rules'][$event]['body'] = ArticleHtml::sanitize($input['rules'][$event]['body']);
        }
        $this->write($request, $id, 'email', fn () => $input);

        return response()->noContent();
    }

    public function savePriority(Request $request, int $id)
    {
        $this->authorizeSettings($request, $id, 'sla');
        $input = $request->validate([
            'id' => ['nullable', 'string', 'max:255'], 'name' => ['required', 'string', 'max:255'],
            'active' => ['required', 'boolean'], 'responseMinutes' => ['required', 'integer', 'min:1', 'max:525600'],
            'resolutionMinutes' => ['required', 'integer', 'min:1', 'max:525600'],
        ]);
        abort_if(isset($input['id']) && $input['id'] !== $input['name'], 422, 'Existing priority names cannot be changed.');
        $input['id'] = $input['name'];
        $this->write($request, $id, 'sla', function ($settings) use ($input) {
            $settings['priorities'] = array_values(array_filter($settings['priorities'], fn ($row) => $row['id'] !== $input['id']));
            abort_if(count($settings['priorities']) >= 100, 422, 'A department may have at most 100 priorities.');
            $settings['priorities'][] = $input;

            return $settings;
        });

        return response()->noContent();
    }

    public function saveClock(Request $request, int $id)
    {
        $this->authorizeSettings($request, $id, 'sla');
        $input = $request->validate([
            'businessHoursOnly' => ['required', 'boolean'], 'pausePending' => ['required', 'boolean'],
            'markAtRisk' => ['required', 'boolean'], 'notifyTeamLead' => ['required', 'boolean'],
            'atRiskPercent' => ['required', 'integer', 'between:1,99'], 'timeZone' => ['required', 'timezone:all'],
            'workDays' => ['required', 'array', 'min:1', 'max:7'], 'workDays.*' => ['integer', 'between:0,6', 'distinct'],
            'startMinute' => ['required', 'integer', 'between:0,1439'], 'endMinute' => ['required', 'integer', 'between:1,1440', 'gt:startMinute'],
        ]);
        $this->write($request, $id, 'sla', fn ($settings) => [...$settings, 'clockRules' => $input]);

        return response()->noContent();
    }

    public function read(Request $request, int $id, string $kind): array
    {
        $json = DB::table('department_configuration')->where('organization_id', $request->user()->organization_id)->where('department_id', $id)->where('kind', $kind)->value('settings');

        return $json ? json_decode($json, true, 512, JSON_THROW_ON_ERROR) : ($kind === 'sla' ? [
            'configured' => true, 'trackingReady' => true, 'settingsOnly' => true,
            'priorities' => array_map(fn ($name, $response, $resolution) => ['id' => $name, 'name' => $name, 'active' => true, 'responseMinutes' => $response, 'resolutionMinutes' => $resolution], ['Critical', 'High', 'Medium', 'Low'], [15, 60, 240, 480], [240, 480, 1440, 4320]),
            'clockRules' => ['businessHoursOnly' => false, 'pausePending' => false, 'markAtRisk' => true, 'atRiskPercent' => 75, 'notifyTeamLead' => false, 'timeZone' => 'UTC', 'workDays' => [1, 2, 3, 4, 5], 'startMinute' => 480, 'endMinute' => 1020],
        ] : []);
    }

    private function write(Request $request, int $id, string $kind, callable $change): void
    {
        DB::transaction(function () use ($request, $id, $kind, $change) {
            DB::table('departments')->where('organization_id', $request->user()->organization_id)->where('id', $id)->lockForUpdate()->first();
            $settings = $change($this->read($request, $id, $kind));
            DB::table('department_configuration')->updateOrInsert(['organization_id' => $request->user()->organization_id, 'department_id' => $id, 'kind' => $kind], ['settings' => json_encode($settings, JSON_THROW_ON_ERROR), 'updated_at' => now()]);
            DB::table('audit_events')->insert(['organization_id' => $request->user()->organization_id, 'user_id' => $request->user()->id, 'action' => 'department.'.$kind.'.saved', 'changes' => json_encode(['department_id' => $id]), 'created_at' => now()]);
        });
    }
}
