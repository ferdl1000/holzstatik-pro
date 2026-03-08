import { useLocation, Link } from 'react-router-dom';

const NotFound = () => {
  const location = useLocation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold font-mono">404</h1>
        <p className="text-lg text-muted-foreground">Seite nicht gefunden</p>
        <p className="text-sm text-muted-foreground">
          Die angeforderte Seite <code className="font-mono bg-muted px-1.5 py-0.5 rounded">{location.pathname}</code> existiert nicht.
        </p>
        <Link to="/" className="inline-block text-primary underline hover:text-primary/80 text-sm">
          Zurück zum Dashboard
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
