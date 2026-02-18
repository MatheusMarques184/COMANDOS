<?php
// send_udp.php - Versão alternativa

header('Content-Type: application/json');

// Desabilita exibição de erros HTML
error_reporting(0);
ini_set('display_errors', 0);

try {
    $ip = $_POST['ip'] ?? '';
    $port = intval($_POST['port'] ?? 0);
    $cmd = $_POST['cmd'] ?? '';

    if (empty($ip) || $port <= 0 || empty($cmd)) {
        throw new Exception('Parâmetros inválidos');
    }

    if (!filter_var($ip, FILTER_VALIDATE_IP)) {
        throw new Exception('IP inválido');
    }

    $cmd = chr(0x77) . $cmd . chr(0x77);

    $socket = stream_socket_client("udp://$ip:$port", $errno, $errstr, 5);
    
    if (!$socket) {
        throw new Exception("Erro ao conectar: $errstr ($errno)");
    }

    $bytes = fwrite($socket, $cmd);
    fclose($socket);

    if ($bytes === false) {
        throw new Exception('Falha ao enviar dados');
    }

    echo json_encode([
        'success' => true,
        'sent' => $cmd,
        'to' => "$ip:$port",
        'bytes' => $bytes
    ]);

} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>