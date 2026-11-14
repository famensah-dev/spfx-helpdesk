<?php

namespace Tests\Feature;

use Tests\TestCase;

class CorsTest extends TestCase
{
    public function test_sharepoint_can_preflight_user_assignment_and_workspace_put_requests(): void
    {
        $origin = 'https://archwaysdigitalgh.sharepoint.com';
        config(['cors.allowed_origins' => [$origin]]);
        foreach (['/api/v1/departments/1/assignments', '/api/v1/workspace-settings'] as $path) {
            $response = $this->options($path, [], [
                'Origin' => $origin,
                'Access-Control-Request-Method' => 'PUT',
                'Access-Control-Request-Headers' => 'authorization,content-type',
            ]);
            $response->assertNoContent()->assertHeader('Access-Control-Allow-Origin', $origin);
            $this->assertContains('PUT', preg_split('/\s*,\s*/', $response->headers->get('Access-Control-Allow-Methods')));
        }
    }

    public function test_unapproved_origins_do_not_receive_cors_permission(): void
    {
        config(['cors.allowed_origins' => ['https://archwaysdigitalgh.sharepoint.com']]);
        $response = $this->options('/api/v1/departments/1/assignments', [], [
            'Origin' => 'https://unapproved.example',
            'Access-Control-Request-Method' => 'PUT',
        ]);
        // A fixed configured origin may be returned; it must never authorize the unapproved origin.
        $this->assertNotSame('https://unapproved.example', $response->headers->get('Access-Control-Allow-Origin'));
        $this->assertNotSame('*', $response->headers->get('Access-Control-Allow-Origin'));
    }
}
