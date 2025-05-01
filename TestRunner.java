import org.junit.runner.JUnitCore;
import org.junit.runner.Result;
import org.junit.runner.notification.Failure;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class TestRunner {
    public static void main(String[] args) {
        // Backup original streams
        PrintStream originalOut = System.out;
        PrintStream originalErr = System.err;

        // Capture output
        ByteArrayOutputStream testOut = new ByteArrayOutputStream();
        ByteArrayOutputStream testErr = new ByteArrayOutputStream();
        System.setOut(new PrintStream(testOut));
        System.setErr(new PrintStream(testErr));

        Result result = JUnitCore.runClasses(MainTest.class);

        // Restore original output
        System.setOut(originalOut);
        System.setErr(originalErr);

        // Construct JSON output manually
        StringBuilder json = new StringBuilder();
        json.append("{");
        json.append("\"state\": \"").append(result.getFailureCount() == 0 ? "passed" : "failed").append("\",");
        json.append("\"tests_run\": ").append(result.getRunCount()).append(",");
        json.append("\"passed\": ").append(result.getRunCount() - result.getFailureCount()).append(",");
        json.append("\"failed\": ").append(result.getFailureCount()).append(",");
        json.append("\"failure_details\": [");

        boolean first = true;
        for (Failure failure : result.getFailures()) {
            if (!first) json.append(",");
            
            String message = failure.getMessage() != null ? failure.getMessage() : "";
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
            json.append("\"test_case\": \"").append(failure.getTestHeader()).append("\",");
            json.append("\"expected\": \"").append(expected.replace("\"", "\\\"")).append("\",");
            json.append("\"received\": \"").append(received.replace("\"", "\\\"")).append("\",");
            json.append("\"error_message\": \"").append(failure.getMessage().replace("\"", "\\\"")).append("\",");
            String rawout = testOut.toString() + testErr.toString();
            json.append("\"rawout\": \"").append(rawout.replace("\"", "\\\"").replace("\n", "\\n")).append("\"");
            json.append("}");
            first = false;
        }

        json.append("]}");

        System.out.println(json.toString());
    }
}