import { useCallback, useRef, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  clearHumanQuestion,
  setHumanQuestion,
} from "../../features/humanQuestionSlice";
import { addMessage } from "../../features/messageHistorySlice";
import { setLoading } from "../../features/loadingSlice";
import {
  setStreamingResponseStatus,
  setStreaminResponseLoaderStatus,
} from "../../features/streaminResponseSlice";
import { toggleChatReload } from "../../features/chatReloadSlice";
import {
  setSqlResult,
  setColumnTypes,
  setColumns2,
  setSqlQuery,
} from "../../features/sqlDataSlice";
import {
  appendToCombinedAttemptMessage,
  appendToCombinedStreamedAiMessages,
} from "../../features/streamedAiMessageSlice";
import { LuSendHorizonal } from "react-icons/lu";
import { v4 as uuidv4 } from "uuid";
import { MdDatasetLinked } from "react-icons/md";

function Inputbox() {
  const dispatch = useDispatch();
  const humanQuestion = useSelector(
    (state) => state.humanQuestion.humanQuestion
  );
  const session_id = useSelector((state) => state.session.session_id);

  const textareaRef = useRef(null);
  const [selectedUrl, setSelectedUrl] = useState("jac"); // State to handle selected URL

  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    dispatch(setHumanQuestion(value));

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, []);

  const handleUrlChange = (e) => {
    setSelectedUrl(e.target.value);
  };

  const fetchStream = useCallback(async () => {
    const req_id = uuidv4();

    if (!humanQuestion.trim()) {
      alert("Please enter a question.");
      return;
    }

    const humanMessage = {
      message: humanQuestion,
      sender: "Human",
      session_id: session_id,
      sql_query: "",
    };

    dispatch(setLoading("loading"));
    dispatch(addMessage(humanMessage));
    dispatch(clearHumanQuestion());

    try {
      const fetchResponse = async (url, body) => {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`);
        }

        return response.body.getReader();
      };

      const processStream1 = async (reader) => {
        const decoder = new TextDecoder("utf-8");
        let partialMessage = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          partialMessage += decoder.decode(value, { stream: true });

          const messagesArray = partialMessage.split("\n\n");
          partialMessage = messagesArray.pop();
          dispatch(
            appendToCombinedAttemptMessage(
              messagesArray.filter(Boolean).join("\n\n")
            )
          );
        }

        if (partialMessage) {
          dispatch(appendToCombinedAttemptMessage(partialMessage));
        }
      };

      const urlMap = {
        jac: "https://workmate-api-private.onrender.com/sql_chain/sql_generator/get_sql/jac",
        bcm: "https://workmate-api-private.onrender.com/sql_chain/sql_generator/get_sql/bcm",
      };

      const reader1 = await fetchResponse(urlMap[selectedUrl], {
        question: humanQuestion,
        uuid: session_id,
        request_id: req_id,
      });

      await processStream1(reader1);
      dispatch(setLoading("stop"));
      dispatch(setStreamingResponseStatus(true));
      dispatch(setStreaminResponseLoaderStatus(true));

      const processStream2 = async (reader) => {
        const decoder = new TextDecoder("utf-8");
        let partialMessage = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          partialMessage += decoder.decode(value, { stream: true });

          const messagesArray = partialMessage.split("\n\n");
          partialMessage = messagesArray.pop();
          dispatch(
            appendToCombinedStreamedAiMessages(
              messagesArray.filter(Boolean).join("\n\n")
            )
          );
        }

        if (partialMessage) {
          dispatch(appendToCombinedStreamedAiMessages(partialMessage));
        }
      };

      const [reader2, response3] = await Promise.all([
        fetchResponse(
          "https://workmate-api-private.onrender.com/sql_chain/sql_generator/get_nlr/v1",
          {
            question: humanQuestion,
            session_id: session_id,
            request_id: req_id,
          }
        ),
        fetch(
          "https://workmate-api-private.onrender.com/sql_chain/actual_data",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ request_id: req_id }),
          }
        ),
      ]);

      await processStream2(reader2);

      dispatch(setStreaminResponseLoaderStatus(false));
      if (response3.ok) {
        const responseData = await response3.json();
        dispatch(setSqlResult(responseData.results));
        dispatch(setSqlQuery(responseData.query));
        dispatch(setColumns2(responseData.columns));
        dispatch(setColumnTypes(responseData.column_types));
      } else {
        throw new Error(`Failed to fetch response3: ${response3.statusText}`);
      }

      dispatch(setStreamingResponseStatus(false));
      dispatch(toggleChatReload());
    } catch (error) {
      console.error("An error occurred:", error);
      dispatch(setLoading("stop"));
    }
  }, [humanQuestion, session_id, selectedUrl]);

  return (
    <>
      <div className="w-[70%]">
        <div className="flex items-center my-2 rounded-sm border-[1px]  bg-white w-[30%]">
          <span className="text-2xl mx-1">

          <MdDatasetLinked />
          </span>
          <select
            className="border-none outline-none py-2"
            value={selectedUrl}
            onChange={handleUrlChange}
          >
            <option value="jac">JAC</option>
            <option value="bcm">BCM</option>
          </select>
        </div>

        <div className="w-[100%] bg-white border-[1px] px-4 flex justify-between items-center rounded-md">
          <textarea
            ref={textareaRef}
            className="border-none outline-none w-[70%] py-2 h-auto max-h-40 resize-none overflow-y-auto"
            placeholder="Type your message here"
            value={humanQuestion}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                fetchStream();
              }
            }}
          />

          <div onClick={fetchStream} className="cursor-pointer px-4 py-2">
            <div className="text-2xl">
              <LuSendHorizonal />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default Inputbox;
