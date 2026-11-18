import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";

import { AuthProvider } from "@/features/auth/AuthProvider";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { ApiError } from "@/shared/api/client";
import { FullPageSpinner } from "@/shared/ui/FullPageSpinner";

import { Layout } from "./Layout";

// Découpage du bundle : l'éditeur (lourd) n'est chargé que sur les pages média.
const HomePage = lazy(() => import("@/pages/HomePage"));
const MediaPage = lazy(() => import("@/pages/MediaPage"));
const LibraryPage = lazy(() => import("@/pages/LibraryPage"));
const SearchPage = lazy(() => import("@/pages/SearchPage"));
const InformationPage = lazy(() => import("@/pages/InformationPage"));
const ContactPage = lazy(() => import("@/pages/ContactPage"));
const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "video", element: <MediaPage kind="video" /> },
          { path: "video/:mediaId", element: <MediaPage kind="video" /> },
          { path: "image", element: <MediaPage kind="image" /> },
          { path: "image/:mediaId", element: <MediaPage kind="image" /> },
          { path: "bibliotheque", element: <LibraryPage /> },
          { path: "search", element: <SearchPage /> },
          { path: "information", element: <InformationPage /> },
          { path: "contact", element: <ContactPage /> },
          { path: "accueil", element: <Navigate to="/" replace /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Suspense fallback={<FullPageSpinner />}>
          <RouterProvider router={router} />
        </Suspense>
      </AuthProvider>
    </QueryClientProvider>
  );
}
