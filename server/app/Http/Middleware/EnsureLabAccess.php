<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware to ensure the authenticated user has access to the requested lab.
 *
 * Expects a route parameter named 'lab' (the lab ID).
 * Superadmins have access to all labs; operators only to assigned labs.
 */
class EnsureLabAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $labId = $request->route('lab');

        if (!$user) {
            return response()->json([
                'message' => 'Unauthenticated.',
            ], Response::HTTP_UNAUTHORIZED);
        }

        // Superadmins have universal access
        if ($user->isSuperAdmin()) {
            return $next($request);
        }

        // Operators must have explicit lab assignment
        if (!$user->hasLabAccess((int) $labId)) {
            return response()->json([
                'message' => 'Anda tidak memiliki akses ke lab ini.',
            ], Response::HTTP_FORBIDDEN);
        }

        return $next($request);
    }
}
