import org.junit.runner.JUnitCore;
import org.junit.runner.Result;
import org.junit.runner.notification.Failure;
import java.util.*;

public class TestRunner {
    public static void main(String[] args) {
        Result result = JUnitCore.runClasses(MainTest.class);

        // Construct JSON output manually
        StringBuilder json = new StringBuilder();
        json.append("{");
        json.append("\"state\": \"").append(result.getFailureCount() == 0 ? "Passed" : "Failed").append("\",");
        json.append("\"tests_run\": ").append(result.getRunCount()).append(",");
        json.append("\"passed\": ").append(result.getRunCount() - result.getFailureCount()).append(",");
        json.append("\"failed\": ").append(result.getFailureCount()).append(",");
        json.append("\"failure_details\": [");

        boolean first = true;
        for (Failure failure : result.getFailures()) {
            if (!first) json.append(",");
            json.append("{");
            json.append("\"test_case\": \"").append(failure.getTestHeader()).append("\",");
            json.append("\"error_message\": \"").append(failure.getMessage().replace("\"", "\\\"")).append("\"");
            json.append("}");
            first = false;
        }

        json.append("]}");

        System.out.println(json.toString());
    }
}