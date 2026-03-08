import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatusIndicator } from '@/components/shared/StatusIndicator';
import { Plus, FolderOpen, Clock, AlertTriangle, CheckCircle, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProjects } from '@/hooks/useProjects';
import { useAuth } from '@/contexts/AuthContext';

const Dashboard = () => {
  const { projects, loading, deleteProject } = useProjects();
  const { profile } = useAuth();

  const inProgress = projects.filter(p => p.status === 'yellow').length;
  const complete = projects.filter(p => p.status === 'green').length;
  const issues = projects.filter(p => p.status === 'red').length;

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {profile?.display_name ? `Hallo, ${profile.display_name}` : 'Projekte'}
            </h1>
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

        <div className="grid grid-cols-4 gap-4">
          {[
            { icon: FolderOpen, label: 'Projekte', value: projects.length.toString(), color: 'text-primary' },
            { icon: Clock, label: 'In Bearbeitung', value: inProgress.toString(), color: 'text-status-yellow' },
            { icon: AlertTriangle, label: 'Probleme', value: issues.toString(), color: 'text-status-red' },
            { icon: CheckCircle, label: 'Abgeschlossen', value: complete.toString(), color: 'text-status-green' },
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

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Laden…</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <FolderOpen className="h-12 w-12 text-muted-foreground/30 mx-auto" />
            <p className="text-muted-foreground">Noch keine Projekte vorhanden.</p>
            <Link to="/new">
              <Button className="gap-2"><Plus className="h-4 w-4" />Erstes Projekt anlegen</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <div key={project.id} className="rounded-lg border bg-card p-5 transition-all hover:shadow-md hover:border-primary/30">
                <div className="flex items-start justify-between">
                  <Link to={`/project/${project.id}?tab=plan`} className="flex items-start gap-4 flex-1">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{project.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{project.description}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Erstellt: {new Date(project.created_at).toLocaleDateString('de-AT')}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Schritt {project.current_step}/10
                        </span>
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-center gap-3">
                    <StatusIndicator status={project.status as any} />
                    <div className="flex gap-0.5">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-1.5 w-3 rounded-full ${
                            i < project.current_step ? 'bg-primary' : 'bg-muted'
                          }`}
                        />
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.preventDefault();
                        if (confirm('Projekt wirklich löschen?')) deleteProject(project.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

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
