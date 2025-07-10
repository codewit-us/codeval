import org.junit.platform.engine.discovery.DiscoverySelectors;
import org.junit.platform.launcher.*;
import org.junit.platform.launcher.core.*;

import org.junit.platform.launcher.listeners.*;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class TestRunner {

    private static String escapeForJson(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\")
                    .replace("\"", "\\\"")
                    .replace("\n", "\\n")
                    .replace("\r", "\\r");
    }
    public static void main(String[] args) {
        PrintStream originalOut = System.out;
        PrintStream originalErr = System.err;

        ByteArrayOutputStream testOut = new ByteArrayOutputStream();
        ByteArrayOutputStream testErr = new ByteArrayOutputStream();
        System.setOut(new PrintStream(testOut));
        System.setErr(new PrintStream(testErr));

        LauncherDiscoveryRequest request = LauncherDiscoveryRequestBuilder.request()
            .selectors(DiscoverySelectors.selectClass(MainTest.class))
            .build();

        SummaryGeneratingListener listener = new SummaryGeneratingListener();
        Launcher launcher = LauncherFactory.create();
        launcher.registerTestExecutionListeners(listener);
        launcher.execute(request);

        TestExecutionSummary summary = listener.getSummary();

        // Restore output
        System.setOut(originalOut);
        System.setErr(originalErr);

        StringBuilder json = new StringBuilder();
        json.append("{");
        json.append("\"state\": \"").append(summary.getTotalFailureCount() == 0 ? "passed" : "failed").append("\",");
        json.append("\"tests_run\": ").append(summary.getTestsStartedCount()).append(",");
        json.append("\"passed\": ").append(summary.getTestsSucceededCount()).append(",");
        json.append("\"failed\": ").append(summary.getTotalFailureCount()).append(",");
        json.append("\"failure_details\": [");

        boolean first = true;
        for (TestExecutionSummary.Failure failure : summary.getFailures()) {
            if (!first) json.append(",");
            String rawout = testOut.toString() + testErr.toString();
            String message = failure.getException().getMessage() != null ? failure.getException().getMessage() : "";
            String expected = "";
            String received = "";

            Pattern pattern1 = Pattern.compile("expected:\\s*<(.*?)>\\s*but was:\\s*<(.*?)>");
            Matcher matcher1 = pattern1.matcher(message);
            if (matcher1.find()) {
                expected = matcher1.group(1);
                received = matcher1.group(2);
            } else {
                Pattern pattern2 = Pattern.compile("(.*?)\\s*[!=]=\\s*(.*)");
                Matcher matcher2 = pattern2.matcher(message);
                if (matcher2.find()) {
                    received = matcher2.group(1).trim();
                    expected = matcher2.group(2).trim();
                }
            }

            json.append("{");
            json.append("\"test_case\": \"").append(failure.getTestIdentifier().getDisplayName()).append("\",");
            json.append("\"expected\": \"").append(escapeForJson(expected)).append("\",");
            json.append("\"received\": \"").append(escapeForJson(received)).append("\",");
            json.append("\"error_message\": \"").append(escapeForJson(message)).append("\",");
            json.append("\"rawout\": \"").append(escapeForJson(rawout)).append("\"");
            json.append("}");
            first = false;
        }

        json.append("]}");

        System.out.println(json.toString());
    }
}