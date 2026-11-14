<?php

return [
    'deployment_mode' => env('HELPDESK_DEPLOYMENT_MODE', 'dedicated'),
    'organization_slug' => env('HELPDESK_ORGANIZATION_SLUG'),
    'audience' => env('ENTRA_API_CLIENT_ID'),
    'scope' => 'access_as_user',
];
