# based on this: https://github.com/aws/aws-cli/issues/2887

# Usage: cf_wait_final_status stack-name [region]
#   stack-name - name of the stack to wait on a status for
#   region (optional) - the region that contains the stack. Defaults to us-east-1
cf_wait_final_status() {
    local stack="$1"
    local region="${2:-us-east-1}"
    local lastEvent
    local lastEventId
    local stackStatus=$(aws cloudformation describe-stacks --region "$region" --stack-name "$stack" | jq -c -r .Stacks[0].StackStatus)

    if [ -z "$stackStatus" ]
    then
        echo "Stack not found: $stack"
        return 1
    else
        until
            # todo: add timeout exit condition?
            [ "$stackStatus" = "CREATE_COMPLETE" ] ||
            [ "$stackStatus" = "CREATE_FAILED" ] ||
            [ "$stackStatus" = "DELETE_COMPLETE" ] ||
            [ "$stackStatus" = "DELETE_FAILED" ] ||
            [ "$stackStatus" = "ROLLBACK_COMPLETE" ] ||
            [ "$stackStatus" = "ROLLBACK_FAILED" ] ||
            [ "$stackStatus" = "UPDATE_COMPLETE" ] ||
            [ "$stackStatus" = "UPDATE_ROLLBACK_COMPLETE" ] ||
            [ "$stackStatus" = "UPDATE_ROLLBACK_FAILED" ] ||
            # status is empty. this happens if the stack is in the process of deletion at start of loop, but finishes during.
            [ -z "$stackStatus" ]
        do

            #[[ $stackStatus == *""* ]] || [[ $stackStatus == *"CREATE_FAILED"* ]] || [[ $stackStatus == *"COMPLETE"* ]]; do
            lastEvent=$(aws cloudformation describe-stack-events --region "$region" --stack "$stack" --query 'StackEvents[].{ EventId: EventId, LogicalResourceId:LogicalResourceId, ResourceType:ResourceType, ResourceStatus:ResourceStatus, Timestamp: Timestamp }' --max-items 1 | jq .[0])
            eventId=$(echo "$lastEvent" | jq -r .EventId)
            if [ "$eventId" != "$lastEventId" ]; then
                lastEventId=$eventId
                echo $(echo "$lastEvent" | jq -r '.Timestamp + "\t-\t" + .ResourceType + "\t-\t" + .LogicalResourceId + "\t-\t" + .ResourceStatus')
            fi
            sleep 3
            stackStatus=$(aws cloudformation describe-stacks --region "$region" --stack-name "$stack" | jq -c -r .Stacks[0].StackStatus)
        done
    fi
    echo "Stack Status: $stackStatus"
    return 0
}

# Deletes the stack if it is in a bad state
# (one of: CREATE_FAILED, DELETE_FAILED, ROLLBACK_COMPLETE, ROLLBACK_FAILED).
cf_delete_if_bad_state() {
    local stackname="$1"
    local region="${2:-us-east-1}"

    # check if the stack exists
    stackStatus=$(aws cloudformation describe-stacks --region "$region" \
        --stack-name "$stackname" | jq -c -r .Stacks[0].StackStatus)

    # if stack exists in a bad state, delete it
    if [ "$stackStatus" = "CREATE_FAILED" ] || [ "$stackStatus" = "DELETE_FAILED" ] || [ "$stackStatus" = "ROLLBACK_COMPLETE" ] || [ "$stackStatus" = "ROLLBACK_FAILED" ] || [ "$stackStatus" = "UPDATE_ROLLBACK_FAILED" ]; then
        echo Deleting stack "$stackname"
        aws cloudformation delete-stack --stack-name "$stackname"
        cf_wait_final_status "$stackname"
    fi
}

# Usage: cf_print_stack_output my-stack a-specific-stack-output-name
cf_print_stack_output() {
    local stackName="$1"
    local outputName="$2"
    aws cloudformation describe-stacks \
        --stack-name "$stackName" \
        --query "Stacks[0].Outputs[?OutputKey=='$outputName'].OutputValue" \
        --output text
}

# Usage: cf_print_stack_output my-stack an-export-name
cf_print_stack_export() {
    local exportName="$1"
    aws cloudformation list-exports --query "Exports[?Name=='$exportName'].Value" --no-paginate --output text
}

# Prints the elastic IPs assigned to the specified stack, tab-delimited.
# Usage: cf_print_elastic_ips some-stack-name
cf_print_elastic_ips() {
    local stackName=$1
    aws cloudformation describe-stack-resources --stack-name "$stackName" \
      --no-paginate --query "StackResources[?ResourceType=='AWS::EC2::EIP'].PhysicalResourceId" \
      --output text
}

# Prints colorized JSON for the events of the named stack
# Usage: cf_print_stack_events stack-name
#    stack-name - the name of the stack for which to print events
cf_print_stack_events() {
    local stackName="$1"
    aws cloudformation describe-stack-events --no-paginate --stack-name "$stackName" | jq '.'
}
