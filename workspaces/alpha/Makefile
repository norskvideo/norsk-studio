.PHONY: all

types_input := $(wildcard src/*/types.yaml)
types_output := $(types_input:.yaml=.ts) 

all: $(types_output)

clean: 
	rm -f $(types_output)
	
define file_target
$(1:.yaml=.ts): $(1) 
	npx openapi-typescript $(1) -o $(1:.yaml=.ts)
endef

$(foreach file,$(types_input),$(eval $(call file_target,$(file))))
