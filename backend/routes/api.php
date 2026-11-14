<?php

use App\Http\Controllers\ClassificationController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\SessionController;
use App\Http\Controllers\TicketController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->middleware(['throttle:120,1', 'entra'])->group(function () {
    Route::get('session', SessionController::class);
    Route::get('ticket-options', [ClassificationController::class, 'options']);
    Route::get('departments', [DepartmentController::class, 'index']);
    Route::post('departments', [DepartmentController::class, 'create']);
    Route::get('departments/{id}', [DepartmentController::class, 'show'])->whereNumber('id');
    Route::patch('departments/{id}', [DepartmentController::class, 'save'])->whereNumber('id');
    Route::get('classifications/{kind}', [ClassificationController::class, 'index']);
    Route::post('classifications/{kind}', [ClassificationController::class, 'save']);
    Route::patch('classifications/{kind}/{id}', [ClassificationController::class, 'save'])->whereNumber('id');
    Route::get('users', [UserController::class, 'index']);
    Route::post('users', [UserController::class, 'store']);
    Route::get('assignees', [UserController::class, 'assignees']);
    Route::get('tickets', [TicketController::class, 'index']);
    Route::post('tickets', [TicketController::class, 'store']);
    Route::patch('tickets/{ticket}', [TicketController::class, 'update']);
    Route::get('tickets/{ticket}/comments', [TicketController::class, 'comments']);
    Route::post('tickets/{ticket}/comments', [TicketController::class, 'addComment']);
    Route::get('tickets/{ticket}/history', [TicketController::class, 'history']);
    Route::post('tickets/{ticket}/response', [TicketController::class, 'response']);
});
