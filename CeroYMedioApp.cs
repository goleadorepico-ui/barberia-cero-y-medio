using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Runtime.InteropServices;

namespace CeroYMedio
{
    static class Program
    {
        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [STAThread]
        static void Main(string[] args)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string port = "3000";
            string url = "http://localhost:" + port;

            // 1. Crear acceso directo en el Escritorio de Windows
            CrearAccesoDirectoEscritorio(baseDir);

            // 2. Verificar si el servidor local ya esta respondiendo
            if (!IsServerRunning(url + "/api/data"))
            {
                // Iniciar iniciar_sistema.py de forma completamente oculta (sin ventana de consola)
                IniciarServidorSilencioso(baseDir);

                // Esperar a que el servidor este listo (hasta 8 segundos)
                for (int i = 0; i < 40; i++)
                {
                    Thread.Sleep(200);
                    if (IsServerRunning(url + "/api/data"))
                        break;
                }
            }

            // 3. Abrir en modo Aplicacion de Escritorio Nativa (Edge App Mode)
            AbrirAplicacionNativa(url, baseDir);
        }

        static bool IsServerRunning(string testUrl)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(testUrl);
                request.Timeout = 800;
                request.Method = "GET";
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    return response.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        static void IniciarServidorSilencioso(string baseDir)
        {
            try
            {
                string scriptPath = Path.Combine(baseDir, "iniciar_sistema.py");
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "python";
                psi.Arguments = "\"" + scriptPath + "\"";
                psi.WorkingDirectory = baseDir;
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                psi.WindowStyle = ProcessWindowStyle.Hidden;

                Process.Start(psi);
            }
            catch
            {
                try
                {
                    string scriptPath = Path.Combine(baseDir, "iniciar_sistema.py");
                    ProcessStartInfo psi = new ProcessStartInfo("py", "\"" + scriptPath + "\"");
                    psi.WorkingDirectory = baseDir;
                    psi.CreateNoWindow = true;
                    psi.UseShellExecute = false;
                    psi.WindowStyle = ProcessWindowStyle.Hidden;
                    Process.Start(psi);
                }
                catch { }
            }
        }

        static void AbrirAplicacionNativa(string url, string baseDir)
        {
            string edgePath = null;

            string[] possiblePaths = new string[]
            {
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Edge\Application\msedge.exe"),
                @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
            };

            foreach (string p in possiblePaths)
            {
                if (File.Exists(p))
                {
                    edgePath = p;
                    break;
                }
            }

            if (!string.IsNullOrEmpty(edgePath))
            {
                // Modo App nativo: sin barra de URLs, sin pestanas, con ventana limpia
                string arguments = string.Format("--app=\"{0}\" --window-size=1360,900", url);
                ProcessStartInfo psi = new ProcessStartInfo(edgePath, arguments);
                psi.WorkingDirectory = baseDir;
                Process p = Process.Start(psi);
                if (p != null)
                {
                    try { SetForegroundWindow(p.MainWindowHandle); } catch { }
                }
            }
            else
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
        }

        static void CrearAccesoDirectoEscritorio(string baseDir)
        {
            try
            {
                string desktopFolder = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string shortcutPath = Path.Combine(desktopFolder, "Cero y Medio - Barberia.lnk");
                string targetExe = Path.Combine(baseDir, "Cero y Medio.exe");
                string iconPath = Path.Combine(baseDir, "app.ico");

                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType != null)
                {
                    dynamic shell = Activator.CreateInstance(shellType);
                    dynamic shortcut = shell.CreateShortcut(shortcutPath);
                    shortcut.TargetPath = targetExe;
                    shortcut.WorkingDirectory = baseDir;
                    shortcut.Description = "Cero y Medio - Sistema de Gestion de Barberia";
                    if (File.Exists(iconPath))
                    {
                        shortcut.IconLocation = iconPath + ", 0";
                    }
                    shortcut.Save();
                }
            }
            catch { }
        }
    }
}
