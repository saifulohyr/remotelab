<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware to ensure the authenticated user has the required role.
 *
 * Usage in routes: ->middleware('role:superadmin') or ->middleware('role:superadmin,operator')
 */
class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (!$user || !in_array($user->role, $roles)) {
            return response()->json([
                'message' => 'Akses ditolak. Role tidak sesuai.',
            ], Response::HTTP_FORBIDDEN);
        }

        return $next($request);
    }
}
