import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { MOCK_PROJECT } from '@/data/mockProject';
import { StatusIndicator } from '@/components/shared/StatusIndicator';
import { Plus, FolderOpen, Clock, AlertTriangle, CheckCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Dashboard = () => {
  const projects = [MOCK_PROJECT];

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Projekte</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Dachtragwerk-Vorbemessung aus Einreichplänen
            </p>
          </div>
          <Link to="/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Neues Projekt
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { icon: FolderOpen, label: 'Projekte', value: '1', color: 'text-primary' },
            { icon: Clock, label: 'In Bearbeitung', value: '1', color: 'text-status-yellow' },
            { icon: AlertTriangle, label: 'Prüfung nötig', value: '3', color: 'text-status-yellow' },
            { icon: CheckCircle, label: 'Abgeschlossen', value: '0', color: 'text-status-green' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold font-mono">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Project List */}
        <div className="space-y-3">
          {projects.map((project) => (
            <Link key={project.id} to={`/project/demo?tab=plan`} className="block">
              <div className="rounded-lg border bg-card p-5 transition-all hover:shadow-md hover:border-primary/30">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{project.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{project.description}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Erstellt: {new Date(project.createdAt).toLocaleDateString('de-AT')}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Schritt {project.currentStep}/10
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {project.documents.length} Dokument(e)
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusIndicator status={project.status} />
                    <div className="flex gap-0.5">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-1.5 w-3 rounded-full ${
                            i < project.currentStep
                              ? 'bg-primary'
                              : 'bg-muted'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Disclaimer */}
        <div className="rounded-lg border border-status-yellow/30 bg-status-yellow-bg p-4 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-status-yellow shrink-0 mt-0.5" />
          <div className="text-xs text-foreground/80 leading-relaxed">
            <strong>Wichtiger Hinweis:</strong> Diese Anwendung erstellt Vorbemessungen und prüffähige Vorbereitungen.
            Die Ergebnisse ersetzen keine rechtsverbindliche statische Berechnung durch eine qualifizierte Fachperson
            (Ziviltechniker, Statiker). Alle automatisch erkannten Werte müssen vor Verwendung geprüft und bestätigt werden.
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
