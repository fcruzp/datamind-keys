import { NextResponse } from 'next/server'
import { readFile, stat } from 'fs/promises'
import path from 'path'

/**
 * GET /api/deployment-files
 *   → lista todos los archivos de despliegue (Coolify / Docker) con su contenido.
 *
 * GET /api/deployment-files?file=docker-compose.yml
 *   → devuelve un solo archivo { name, path, content, size, language }
 *
 * Estos archivos viven en la raíz del repo. Los leemos del filesystem en
 * runtime para que siempre reflejen lo que hay en disco (no hace falta
 * recompilar si el usuario edita el YAML).
 */

const PROJECT_ROOT = process.cwd()

interface DeployFile {
  name: string
  path: string
  content: string
  size: number
  language: 'yaml' | 'dockerfile' | 'bash' | 'env' | 'markdown' | 'text'
  description: string
}

const FILE_MANIFEST: Array<{
  name: string
  language: DeployFile['language']
  description: string
}> = [
  {
    name: 'docker-compose.yml',
    language: 'yaml',
    description: 'Servicio + labels Traefik/Caddy para Coolify (datamind-api.mooo.com)',
  },
  {
    name: 'coolify.yaml',
    language: 'yaml',
    description: 'Config estructurada de Coolify: labels, env vars, service config',
  },
  {
    name: 'Dockerfile',
    language: 'dockerfile',
    description: 'Imagen multi-stage Bun → Next.js 16 standalone',
  },
  {
    name: '.dockerignore',
    language: 'text',
    description: 'Archivos excluidos del contexto de build Docker',
  },
  {
    name: '.env.production.example',
    language: 'env',
    description: 'Plantilla de variables de entorno (Supabase + Postgres + App)',
  },
  {
    name: 'DEPLOY.md',
    language: 'markdown',
    description: 'Guía paso a paso para desplegar en Coolify',
  },
  {
    name: 'Caddyfile',
    language: 'text',
    description: 'Gateway local del sandbox (no se usa en producción)',
  },
]

async function readDeployFile(name: string): Promise<DeployFile | null> {
  const fullPath = path.join(PROJECT_ROOT, name)
  try {
    // Evitar path traversal: el name debe ser un basename plano
    if (path.basename(name) !== name) return null
    const content = await readFile(fullPath, 'utf-8')
    const s = await stat(fullPath)
    const manifest = FILE_MANIFEST.find((f) => f.name === name)
    return {
      name,
      path: fullPath,
      content,
      size: s.size,
      language: manifest?.language ?? 'text',
      description: manifest?.description ?? '',
    }
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const single = url.searchParams.get('file')

  if (single) {
    const file = await readDeployFile(single)
    if (!file) {
      return NextResponse.json(
        { error: `File not found: ${single}` },
        { status: 404 },
      )
    }
    return NextResponse.json(file, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  }

  const files = await Promise.all(
    FILE_MANIFEST.map((f) => readDeployFile(f.name)),
  )
  const valid = files.filter((f): f is DeployFile => f !== null)

  return NextResponse.json(
    { files: valid },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
